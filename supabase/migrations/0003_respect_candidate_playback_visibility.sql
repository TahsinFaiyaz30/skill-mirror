CREATE OR REPLACE FUNCTION public.can_read_owned_recording(owner_directory text, session_directory text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT owner_directory = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.interview_sessions AS session
      WHERE session.user_id = auth.uid()
        AND session.id::text = session_directory
        AND (session.kind IN ('practice','preview') OR session.config->>'feedbackVisibility' = 'full')
    );
$$;
REVOKE ALL ON FUNCTION public.can_read_owned_recording(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_owned_recording(text,text) TO authenticated;

DROP POLICY private_objects_own_read ON storage.objects;
CREATE POLICY private_objects_own_read ON storage.objects FOR SELECT TO authenticated
USING (
  (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text)
  OR (bucket_id IN ('recordings','artifacts') AND
      public.can_read_owned_recording((storage.foldername(name))[1], (storage.foldername(name))[2]))
);
