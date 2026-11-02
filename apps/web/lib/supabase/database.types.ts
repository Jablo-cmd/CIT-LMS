export type UserRole = "COMPANY_OWNER" | "HR_MANAGER" | "ADMIN_PERSONNEL";
export type EmploymentType = "PERMANENT" | "CONTRACT";
export type EmploymentStatus = "ACTIVE" | "SUSPENDED" | "RESIGNED" | "DISMISSED" | "DECEASED";
export type LeaveCategory =
  | "ANNUAL" | "SICK" | "FAMILY_RESPONSIBILITY" | "MATERNITY"
  | "PATERNITY_PARENTAL" | "UNPAID" | "STUDY" | "OTHER";

/** Loose schema typing until `supabase gen types` is run against the project */
export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
    Views: Record<string, never>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: {
      user_role: UserRole;
      employment_type: EmploymentType;
      employment_status: EmploymentStatus;
      leave_category: LeaveCategory;
    };
  };
};
