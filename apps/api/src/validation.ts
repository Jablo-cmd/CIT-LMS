import { z } from "zod";

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

/** Optional query-string enum: a blank value means "not supplied"; anything else must be a valid member. */
export function optionalEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(blankToUndefined, z.enum(values).optional());
}

/** Optional query-string date: a blank value means "not supplied"; anything else must be a valid date. */
export const optionalDate = z.preprocess(blankToUndefined, z.coerce.date().optional());

export const employmentStatuses = ["ACTIVE", "SUSPENDED", "RESIGNED", "DISMISSED", "DECEASED"] as const;
export const leaveCategories = ["ANNUAL", "SICK", "FAMILY_RESPONSIBILITY", "MATERNITY", "PATERNITY_PARENTAL", "UNPAID", "STUDY", "OTHER"] as const;
export const documentCategories = ["ACADEMIC_QUALIFICATION", "PROFESSIONAL_CERTIFICATE", "TRAINING_CERTIFICATE", "IDENTITY_PERSONAL", "EMPLOYMENT", "OTHER"] as const;
