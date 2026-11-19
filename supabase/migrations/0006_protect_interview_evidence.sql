-- CV uploads and changes are validated by the application's owner-scoped routes.
REVOKE INSERT, UPDATE, DELETE ON public.candidate_cvs FROM authenticated, anon, PUBLIC;

-- An old row with an unrecognized object path cannot establish ownership of its cached parse.
UPDATE public.candidate_cvs
SET storage_path = user_id::text || '/' || id::text || '.pdf',
    parsed = NULL, page_count = NULL, parse_status = 'failed',
    error = 'Upload this CV again to confirm its source.'
WHERE storage_path <> user_id::text || '/' || id::text || '.pdf'
  AND storage_path <> user_id::text || '/sample.pdf';

-- Correct existing practice certificates where every technical evaluation failed.
UPDATE public.certificates c SET revoked = true
FROM public.interview_sessions s
WHERE s.id = c.session_id AND s.kind = 'practice' AND NOT c.revoked
  AND EXISTS (SELECT 1 FROM public.turns t WHERE t.session_id = s.id AND t.item_kind = 'technical' AND t.scores->>'scoringFailed' = 'true')
  AND NOT EXISTS (SELECT 1 FROM public.turns t WHERE t.session_id = s.id AND t.item_kind = 'technical' AND t.competency_key IS NOT NULL AND t.difficulty IS NOT NULL AND t.scores IS NOT NULL AND t.scores->>'scoringFailed' IS DISTINCT FROM 'true');

-- Rebuild derived practice results from retained turns when an affected interview is reopened.
-- Retain original transcripts, recordings and model evaluations. Finalization updates
-- any existing eligible certificate alongside its corrected report.
WITH affected AS (
  UPDATE public.reports r SET status = 'queued', data = NULL, overall_score = NULL,
    verdict = NULL, completed_at = NULL, updated_at = now(), step = 'score', progress = 60,
    steps_done = ARRAY['verify_media','transcribe','align','rescore','tone']
  FROM public.interview_sessions s
  WHERE s.id = r.session_id AND s.kind = 'practice' AND r.status = 'completed'
    AND EXISTS (SELECT 1 FROM public.turns t WHERE t.session_id = s.id AND t.item_kind = 'technical' AND t.scores->>'scoringFailed' = 'true')
  RETURNING r.session_id
)
UPDATE public.interview_sessions SET status = 'ended' WHERE id IN (SELECT session_id FROM affected);
DELETE FROM public.competency_results c
WHERE EXISTS (SELECT 1 FROM public.turns t WHERE t.session_id = c.session_id AND t.competency_key = c.competency_key AND t.scores->>'scoringFailed' = 'true')
  AND NOT EXISTS (SELECT 1 FROM public.turns t WHERE t.session_id = c.session_id
  AND t.competency_key = c.competency_key AND t.item_kind = 'technical' AND t.difficulty IS NOT NULL
  AND t.scores IS NOT NULL AND t.scores->>'scoringFailed' IS DISTINCT FROM 'true');

-- Existing Off interviews may have uploaded artifacts before the setting was enforced.
-- The retention job retries removal from object storage independently of this transaction.
UPDATE public.interview_sessions
SET baseline = NULL,
    calibration = CASE WHEN calibration IS NULL THEN NULL ELSE
      calibration || '{"gaze":{"yaw0":0,"pitch0":0,"h0":0.5,"v0":0},"posture":{"neckRatio0":0.7,"shoulderWidth0":0.5,"shoulderMidX0":0.5,"shoulderMidY0":0.56}}'::jsonb END,
    media = (media - 'timeline' - 'landmarks' - 'pitch' - 'snapshotsCount') || '{"purgeDelivery":true}'::jsonb
WHERE config #>> '{evaluation,nonverbalPolicy}' = 'off';

UPDATE public.turns t
SET live_metrics = CASE WHEN live_metrics IS NULL THEN NULL ELSE jsonb_build_object('voice', NULL, 'vision',
      jsonb_build_object('faceVisiblePct', live_metrics #> '{vision,faceVisiblePct}', 'multiFacePct', live_metrics #> '{vision,multiFacePct}')) END,
    final_metrics = CASE WHEN final_metrics IS NULL THEN NULL ELSE jsonb_build_object('voice', NULL, 'vision',
      jsonb_build_object('faceVisiblePct', final_metrics #> '{vision,faceVisiblePct}', 'multiFacePct', final_metrics #> '{vision,multiFacePct}')) END,
    tone = NULL
FROM public.interview_sessions s WHERE s.id = t.session_id AND s.config #>> '{evaluation,nonverbalPolicy}' = 'off';

DELETE FROM public.events e USING public.interview_sessions s
WHERE s.id = e.session_id AND s.config #>> '{evaluation,nonverbalPolicy}' = 'off'
  AND NOT ((e.category = 'integrity' AND e.type IN ('face_missing','multiple_faces','reading_pattern','tab_hidden','window_blur'))
       OR (e.category = 'live_vision' AND e.type IN ('second_person','reading_notes','phone_use','left_frame','looking_off_screen')));
UPDATE public.events e SET data = '{}'::jsonb, snapshot_path = NULL
FROM public.interview_sessions s WHERE s.id = e.session_id AND s.config #>> '{evaluation,nonverbalPolicy}' = 'off';
UPDATE public.reports r SET data = jsonb_set(r.data, '{baseline}', 'null'::jsonb)
FROM public.interview_sessions s WHERE s.id = r.session_id AND s.config #>> '{evaluation,nonverbalPolicy}' = 'off' AND r.data IS NOT NULL;
