GRANT SELECT ON public.profiles, public.organizations, public.org_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_cvs, public.openings, public.opening_questions, public.invitations, public.candidate_reviews TO authenticated;
GRANT SELECT ON public.events, public.transcript_segments, public.reports, public.competency_results, public.soft_skill_results TO authenticated;
GRANT SELECT ON public.certificates TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_opening_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF OLD.locked AND (
    NEW.locked IS DISTINCT FROM OLD.locked OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.config IS DISTINCT FROM OLD.config OR NEW.role_title IS DISTINCT FROM OLD.role_title
    OR NEW.role_family IS DISTINCT FROM OLD.role_family OR NEW.seniority IS DISTINCT FROM OLD.seniority
    OR NEW.job_description IS DISTINCT FROM OLD.job_description
  ) THEN
    RAISE EXCEPTION 'This opening is locked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER opening_lock BEFORE UPDATE ON public.openings
FOR EACH ROW EXECUTE FUNCTION public.enforce_opening_lock();

DROP POLICY opening_questions_org ON public.opening_questions;
CREATE POLICY opening_questions_read ON public.opening_questions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.openings o WHERE o.id = opening_id AND public.is_org_member(o.org_id)));
CREATE POLICY opening_questions_add ON public.opening_questions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.openings o WHERE o.id = opening_id AND NOT o.locked AND public.is_org_member(o.org_id)));
CREATE POLICY opening_questions_change ON public.opening_questions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.openings o WHERE o.id = opening_id AND NOT o.locked AND public.is_org_member(o.org_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.openings o WHERE o.id = opening_id AND NOT o.locked AND public.is_org_member(o.org_id)));
CREATE POLICY opening_questions_remove ON public.opening_questions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.openings o WHERE o.id = opening_id AND NOT o.locked AND public.is_org_member(o.org_id)));

CREATE OR REPLACE FUNCTION public.preserve_opening_with_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.interview_sessions WHERE opening_id = OLD.id AND kind = 'company') THEN
    RAISE EXCEPTION 'Close the opening instead' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END
$$;
CREATE TRIGGER opening_with_company_sessions BEFORE DELETE ON public.openings
FOR EACH ROW EXECUTE FUNCTION public.preserve_opening_with_sessions();
