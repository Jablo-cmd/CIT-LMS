-- Private employee documents bucket + policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents',
  'employee-documents',
  false,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Storage path convention: {employee_id}/{uuid}-{filename}
CREATE OR REPLACE FUNCTION public.can_access_document_object(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat public.document_category;
BEGIN
  IF NOT public.is_staff() THEN
    RETURN false;
  END IF;
  IF public.is_hr_or_owner() THEN
    RETURN true;
  END IF;
  SELECT category INTO cat
  FROM public.employee_documents
  WHERE storage_path = object_name
  LIMIT 1;
  IF cat IS NULL THEN
    RETURN true;
  END IF;
  RETURN cat <> 'IDENTITY_PERSONAL';
END;
$$;

CREATE POLICY employee_docs_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'employee-documents' AND public.can_access_document_object(name));

CREATE POLICY employee_docs_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-documents' AND public.is_staff());

CREATE POLICY employee_docs_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'employee-documents' AND public.is_hr_or_owner());

GRANT EXECUTE ON FUNCTION public.can_access_document_object(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_owner_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.profiles;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'COMPANY_OWNER' AND is_active) THEN
    RAISE EXCEPTION 'An active company owner already exists';
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (p_user_id, lower(p_email), p_full_name, 'COMPANY_OWNER', true)
  RETURNING * INTO row;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_owner_profile(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_owner_profile(uuid, text, text) FROM authenticated;
