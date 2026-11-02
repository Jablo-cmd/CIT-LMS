-- Continuation of CIT-LMS init: RLS and grants
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.next_of_kin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_staff ON public.profiles
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY profiles_owner_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY departments_write_hr ON public.departments FOR ALL TO authenticated USING (public.is_hr_or_owner()) WITH CHECK (public.is_hr_or_owner());
CREATE POLICY sites_select ON public.posting_sites FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY sites_write_hr ON public.posting_sites FOR ALL TO authenticated USING (public.is_hr_or_owner()) WITH CHECK (public.is_hr_or_owner());
CREATE POLICY schedules_select ON public.working_schedules FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY schedules_write_hr ON public.working_schedules FOR ALL TO authenticated USING (public.is_hr_or_owner()) WITH CHECK (public.is_hr_or_owner());
CREATE POLICY holidays_select ON public.public_holidays FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY holidays_write_hr ON public.public_holidays FOR ALL TO authenticated USING (public.is_hr_or_owner()) WITH CHECK (public.is_hr_or_owner());

CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY employees_delete_hr ON public.employees FOR DELETE TO authenticated USING (public.is_hr_or_owner());

CREATE POLICY nok_all_staff ON public.next_of_kin FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY history_select ON public.employment_history FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY history_write ON public.employment_history FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY leave_policies_select ON public.leave_policies FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY leave_policies_write ON public.leave_policies FOR ALL TO authenticated USING (public.is_hr_or_owner()) WITH CHECK (public.is_hr_or_owner());
CREATE POLICY leave_tx_select ON public.leave_transactions FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY leave_tx_insert ON public.leave_transactions FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY leave_tx_update_hr ON public.leave_transactions FOR UPDATE TO authenticated USING (public.is_hr_or_owner()) WITH CHECK (public.is_hr_or_owner());

CREATE POLICY overtime_all ON public.overtime_entries FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY disciplinary_hr ON public.disciplinary_records FOR ALL TO authenticated
  USING (public.is_hr_or_owner()) WITH CHECK (public.is_hr_or_owner());
CREATE POLICY recommendations_hr ON public.recommendations FOR ALL TO authenticated
  USING (public.is_hr_or_owner()) WITH CHECK (public.is_hr_or_owner());

CREATE POLICY documents_select ON public.employee_documents FOR SELECT TO authenticated
  USING (
    public.is_hr_or_owner()
    OR (public.is_staff() AND category <> 'IDENTITY_PERSONAL')
  );
CREATE POLICY documents_insert ON public.employee_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.is_hr_or_owner()
    OR (public.is_staff() AND category <> 'IDENTITY_PERSONAL')
  );
CREATE POLICY documents_delete_hr ON public.employee_documents FOR DELETE TO authenticated
  USING (public.is_hr_or_owner());

CREATE POLICY audit_select_hr ON public.audit_logs FOR SELECT TO authenticated USING (public.is_hr_or_owner());
CREATE POLICY audit_insert_staff ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff());

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hr_or_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_working_days(date, date, integer[], date[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_working_leave_days(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.capture_leave_deduction(uuid, public.leave_category, date, date, text, date, uuid, text, boolean) TO authenticated;
