CREATE OR REPLACE FUNCTION public.is_org_member(org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = org AND user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_skill_mirror_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, avatar_url)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_skill_mirror_profile();

CREATE POLICY profiles_own_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_own_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.profiles TO authenticated;
CREATE VIEW public.org_member_profiles WITH (security_barrier = true) AS
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  JOIN public.org_members m ON m.user_id = p.id
  WHERE public.is_org_member(m.org_id);
REVOKE ALL ON public.org_member_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.org_member_profiles TO authenticated;
CREATE POLICY organizations_member_read ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY org_members_read ON public.org_members FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE POLICY openings_org ON public.openings FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY opening_questions_org ON public.opening_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.openings o WHERE o.id = opening_id AND public.is_org_member(o.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.openings o WHERE o.id = opening_id AND public.is_org_member(o.org_id)));
CREATE POLICY invitations_org ON public.invitations FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (
    public.is_org_member(org_id) AND EXISTS (
      SELECT 1 FROM public.openings o WHERE o.id = opening_id AND o.org_id = invitations.org_id
    )
  );
CREATE POLICY candidate_reviews_org ON public.candidate_reviews FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (
    public.is_org_member(org_id) AND EXISTS (
      SELECT 1 FROM public.interview_sessions s WHERE s.id = session_id AND s.org_id = candidate_reviews.org_id
    )
  );
CREATE POLICY cvs_own ON public.candidate_cvs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY sessions_read ON public.interview_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(org_id));
REVOKE SELECT ON public.interview_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, kind, org_id, opening_id, invitation_id, cv_id, company, role_title, role_family, seniority,
  length_minutes, voice_name, ai_mode, status, calibration, t0_epoch_ms, started_at, last_active_at, ended_at,
  duration_ms, end_reason, created_at)
ON public.interview_sessions TO authenticated;

CREATE OR REPLACE FUNCTION public.can_see_session_detail(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.interview_sessions
    WHERE id = target AND ((kind IN ('practice','preview') AND user_id = auth.uid()) OR public.is_org_member(org_id))
  );
$$;
REVOKE ALL ON FUNCTION public.can_see_session_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_session_detail(uuid) TO authenticated;
CREATE POLICY turns_read ON public.turns FOR SELECT TO authenticated USING (public.can_see_session_detail(session_id));
REVOKE SELECT ON public.turns FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, session_id, idx, phase, item_kind, question_source, opening_question_id, competency_key,
  question_id, is_follow_up, difficulty, question_text, say_text, ask_start_ms, ask_end_ms, answer_start_ms,
  answer_end_ms, answer_status, answer_transcript_live, answer_transcript_final, scores, score_total,
  live_metrics, final_metrics, tone, created_at) ON public.turns TO authenticated;
CREATE POLICY events_read ON public.events FOR SELECT TO authenticated USING (public.can_see_session_detail(session_id));
CREATE POLICY transcript_read ON public.transcript_segments FOR SELECT TO authenticated USING (public.can_see_session_detail(session_id));
CREATE POLICY reports_read ON public.reports FOR SELECT TO authenticated USING (public.can_see_session_detail(session_id));
CREATE POLICY competency_results_read ON public.competency_results FOR SELECT TO authenticated USING (public.can_see_session_detail(session_id));
CREATE POLICY soft_skill_results_read ON public.soft_skill_results FOR SELECT TO authenticated USING (public.can_see_session_detail(session_id));
CREATE POLICY certificates_public ON public.certificates FOR SELECT TO anon, authenticated USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES
  ('cvs','cvs',false,52428800), ('recordings','recordings',false,52428800),
  ('artifacts','artifacts',false,52428800), ('org-assets','org-assets',true,1048576)
ON CONFLICT (id) DO UPDATE SET public = excluded.public, file_size_limit = excluded.file_size_limit;
CREATE POLICY private_objects_own_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('cvs','recordings','artifacts') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY org_logos_read ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'org-assets');

ALTER TABLE public.organizations ADD CHECK (char_length(name) BETWEEN 2 AND 80);
ALTER TABLE public.profiles ADD CHECK (intent IS NULL OR intent IN ('practice','hiring'));
ALTER TABLE public.opening_questions ADD CHECK (
  phase IN ('cv_deep_dive','behavioral','technical') AND char_length(text) BETWEEN 1 AND 300
  AND (difficulty IS NULL OR (phase = 'technical' AND difficulty BETWEEN 1 AND 5))
  AND (competency_key IS NULL OR phase = 'technical')
  AND max_follow_ups BETWEEN 0 AND 2 AND cardinality(ideal_points) BETWEEN 3 AND 6
  AND cardinality(red_flags) <= 4 AND expected_minutes BETWEEN 1 AND 5
  AND origin IN ('manual','imported','ai_generated')
);
ALTER TABLE public.candidate_reviews ADD CHECK (rating BETWEEN 1 AND 5 AND char_length(notes) <= 5000 OR rating IS NULL AND char_length(notes) <= 5000);
ALTER TABLE public.interview_sessions ADD CHECK (
  (kind = 'practice' AND length_minutes IN (10,20) AND org_id IS NULL AND opening_id IS NULL)
  OR (kind IN ('company','preview') AND length_minutes IN (15,20,30,45) AND org_id IS NOT NULL AND opening_id IS NOT NULL)
);
ALTER TABLE public.interview_sessions ADD CHECK (voice_name IN ('Kore','Charon') AND ai_mode IN ('live','pipeline','mock'));
ALTER TABLE public.reports ADD CHECK (progress BETWEEN 0 AND 100);
