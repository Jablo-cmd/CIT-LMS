-- CIT-LMS Supabase init schema (tables + leave RPCs)
-- RLS applied in 20261102120050_rls_and_grants.sql
-- Storage in 20261102120100_storage_and_seed_helpers.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE public.user_role AS ENUM ('COMPANY_OWNER', 'HR_MANAGER', 'ADMIN_PERSONNEL');
CREATE TYPE public.employment_type AS ENUM ('PERMANENT', 'CONTRACT');
CREATE TYPE public.employment_status AS ENUM ('ACTIVE', 'SUSPENDED', 'RESIGNED', 'DISMISSED', 'DECEASED');
CREATE TYPE public.leave_category AS ENUM (
  'ANNUAL', 'SICK', 'FAMILY_RESPONSIBILITY', 'MATERNITY',
  'PATERNITY_PARENTAL', 'UNPAID', 'STUDY', 'OTHER'
);
CREATE TYPE public.leave_transaction_type AS ENUM ('DEDUCTION', 'ADJUSTMENT', 'REVERSAL', 'VOID');
CREATE TYPE public.document_category AS ENUM (
  'ACADEMIC_QUALIFICATION', 'PROFESSIONAL_CERTIFICATE', 'TRAINING_CERTIFICATE',
  'IDENTITY_PERSONAL', 'EMPLOYMENT', 'OTHER'
);
CREATE TYPE public.disciplinary_outcome AS ENUM (
  'PENDING', 'NO_ACTION', 'VERBAL_WARNING', 'WRITTEN_WARNING',
  'FINAL_WARNING', 'SUSPENSION', 'DISMISSAL', 'OTHER'
);
CREATE TYPE public.recommendation_type AS ENUM ('COMMENDATION', 'PERFORMANCE', 'PROMOTION', 'OTHER');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  role public.user_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.posting_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  address text, city text, province text,
  is_head_office boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.working_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  working_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  name text NOT NULL,
  country_code text NOT NULL DEFAULT 'ZA',
  UNIQUE (country_code, date)
);

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  nationality text,
  photo_path text,
  photo_updated_at timestamptz,
  address_street text, address_suburb text, address_city text,
  address_province text, address_postal_code text,
  phone text, email text,
  employment_type public.employment_type NOT NULL,
  employment_status public.employment_status NOT NULL DEFAULT 'ACTIVE',
  original_hire_date date NOT NULL,
  contract_start_date date, contract_end_date date,
  department_id uuid REFERENCES public.departments(id),
  current_position text, deployed_role text,
  current_posting_id uuid REFERENCES public.posting_sites(id),
  working_schedule_id uuid REFERENCES public.working_schedules(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employees_name_idx ON public.employees (last_name, first_name);
CREATE INDEX employees_status_idx ON public.employees (employment_status);
CREATE INDEX employees_posting_idx ON public.employees (current_posting_id);

CREATE TABLE public.next_of_kin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text NOT NULL,
  phone text, email text, address text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  category public.document_category NOT NULL,
  title text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  uploaded_by_id uuid NOT NULL REFERENCES public.profiles(id),
  leave_transaction_id uuid,
  overtime_entry_id uuid,
  disciplinary_record_id uuid,
  recommendation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_documents_employee_idx ON public.employee_documents (employee_id, category);

CREATE TABLE public.employment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  previous_position text, new_position text,
  previous_deployed_role text, new_deployed_role text,
  previous_posting_id uuid REFERENCES public.posting_sites(id),
  new_posting_id uuid REFERENCES public.posting_sites(id),
  effective_date date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  manager_name text, notes text,
  supporting_document_id uuid UNIQUE REFERENCES public.employee_documents(id),
  recorded_by_id uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE INDEX employment_history_employee_idx ON public.employment_history (employee_id, effective_date);

CREATE TABLE public.leave_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.leave_category NOT NULL,
  name text NOT NULL,
  entitlement_days numeric(8,2),
  accrual_per_month numeric(8,2),
  employment_type public.employment_type,
  effective_from date NOT NULL,
  effective_to date,
  carry_over_limit numeric(8,2),
  eligibility text, notes text,
  created_by_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE public.leave_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  category public.leave_category NOT NULL,
  transaction_type public.leave_transaction_type NOT NULL,
  days numeric(8,2) NOT NULL,
  balance_after numeric(8,2),
  first_leave_date date, last_leave_date date,
  reference_number text, paper_form_date date,
  policy_id uuid REFERENCES public.leave_policies(id),
  notes text,
  reverses_id uuid REFERENCES public.leave_transactions(id),
  captured_by_id uuid NOT NULL REFERENCES public.profiles(id),
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, category, reference_number)
);
CREATE INDEX leave_tx_employee_idx ON public.leave_transactions (employee_id, category, captured_at);

ALTER TABLE public.employee_documents
  ADD CONSTRAINT employee_documents_leave_fk
  FOREIGN KEY (leave_transaction_id) REFERENCES public.leave_transactions(id);

CREATE TABLE public.overtime_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  posting_site_id uuid REFERENCES public.posting_sites(id),
  work_date date NOT NULL,
  start_time text NOT NULL, finish_time text NOT NULL,
  total_hours numeric(6,2) NOT NULL,
  confirmed_by text NOT NULL,
  captured_by_id uuid NOT NULL REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX overtime_work_date_idx ON public.overtime_entries (work_date, employee_id);

ALTER TABLE public.employee_documents
  ADD CONSTRAINT employee_documents_overtime_fk
  FOREIGN KEY (overtime_entry_id) REFERENCES public.overtime_entries(id);

CREATE TABLE public.disciplinary_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  hearing_date date NOT NULL,
  matter text NOT NULL, finding text,
  outcome public.disciplinary_outcome NOT NULL DEFAULT 'PENDING',
  sanction text, notes text,
  captured_by_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX disciplinary_employee_idx ON public.disciplinary_records (employee_id, hearing_date);

ALTER TABLE public.employee_documents
  ADD CONSTRAINT employee_documents_disciplinary_fk
  FOREIGN KEY (disciplinary_record_id) REFERENCES public.disciplinary_records(id);

CREATE TABLE public.recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  type public.recommendation_type NOT NULL,
  description text NOT NULL,
  submitted_by text NOT NULL,
  captured_by_id uuid NOT NULL REFERENCES public.profiles(id),
  comments text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendations_employee_idx ON public.recommendations (employee_id, date);

ALTER TABLE public.employee_documents
  ADD CONSTRAINT employee_documents_recommendation_fk
  FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_data jsonb, after_data jsonb,
  ip_address text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON public.audit_logs (entity_type, entity_id, created_at);
CREATE INDEX audit_user_idx ON public.audit_logs (user_id, created_at);

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true);
$$;

CREATE OR REPLACE FUNCTION public.is_hr_or_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_active = true AND role IN ('COMPANY_OWNER', 'HR_MANAGER')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true AND role = 'COMPANY_OWNER'
  );
$$;

CREATE OR REPLACE FUNCTION public.count_working_days(
  p_first date, p_last date, p_working_days integer[], p_holidays date[] DEFAULT '{}'
) RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d date; n integer := 0;
BEGIN
  IF p_first IS NULL OR p_last IS NULL THEN RAISE EXCEPTION 'Valid leave dates are required'; END IF;
  IF p_last < p_first THEN RAISE EXCEPTION 'Last leave date must be on or after the first leave date'; END IF;
  d := p_first;
  WHILE d <= p_last LOOP
    IF EXTRACT(DOW FROM d)::integer = ANY (p_working_days) AND NOT (d = ANY (p_holidays)) THEN
      n := n + 1;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_working_leave_days(
  p_employee_id uuid, p_first date, p_last date
) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE wd integer[]; holidays date[];
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT COALESCE(ws.working_days, ARRAY[1,2,3,4,5]) INTO wd
  FROM public.employees e
  LEFT JOIN public.working_schedules ws ON ws.id = e.working_schedule_id
  WHERE e.id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT COALESCE(array_agg(ph.date), '{}') INTO holidays
  FROM public.public_holidays ph
  WHERE ph.country_code = 'ZA' AND ph.date BETWEEN p_first AND p_last;
  RETURN public.count_working_days(p_first, p_last, wd, holidays);
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_leave_deduction(
  p_employee_id uuid,
  p_category public.leave_category,
  p_first date, p_last date,
  p_reference_number text, p_paper_form_date date,
  p_policy_id uuid, p_notes text DEFAULT NULL,
  p_allow_negative boolean DEFAULT false
) RETURNS public.leave_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE days_count integer; current_balance numeric(8,2); new_balance numeric(8,2); row public.leave_transactions;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Authentication required'; END IF;
  days_count := public.calculate_working_leave_days(p_employee_id, p_first, p_last);
  IF days_count <= 0 THEN RAISE EXCEPTION 'Leave range has no working days'; END IF;
  PERFORM 1 FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type = 'DEDUCTION' THEN -days
      WHEN transaction_type IN ('ADJUSTMENT', 'REVERSAL') THEN days
      ELSE 0
    END
  ), 0) INTO current_balance
  FROM public.leave_transactions
  WHERE employee_id = p_employee_id AND category = p_category AND transaction_type <> 'VOID';
  new_balance := current_balance - days_count;
  IF new_balance < 0 AND NOT COALESCE(p_allow_negative, false) THEN
    RAISE EXCEPTION 'Insufficient leave balance';
  END IF;
  INSERT INTO public.leave_transactions (
    employee_id, category, transaction_type, days, balance_after,
    first_leave_date, last_leave_date, reference_number, paper_form_date,
    policy_id, notes, captured_by_id
  ) VALUES (
    p_employee_id, p_category, 'DEDUCTION', days_count, new_balance,
    p_first, p_last, NULLIF(trim(p_reference_number), ''), p_paper_form_date,
    p_policy_id, p_notes, auth.uid()
  ) RETURNING * INTO row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'LEAVE_DEDUCTION', 'LeaveTransaction', row.id::text, to_jsonb(row));
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email, updated_at = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_auth_user_updated();
