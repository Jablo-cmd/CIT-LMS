/**
 * The approved job positions for CIT Business Solutions (an IT company). Employee positions must be one of these;
 * the API enforces it and the web app loads the list from GET /api/postings/positions so there is one source of truth.
 */
export const POSITIONS = ["Help Desk", "IT Technician", "Director", "Human Resources", "Administrator", "Network Engineer"] as const;
export type Position = (typeof POSITIONS)[number];
