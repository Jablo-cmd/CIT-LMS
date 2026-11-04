import "dotenv/config";

const base = (process.env.SMOKE_API_URL ?? "http://127.0.0.1:4000/api").replace(/\/$/, "");
const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(10_000) });
const payload = await response.json().catch(() => ({})) as { status?: string; database?: string; service?: string };
if (!response.ok || payload.status !== "ok" || payload.database !== "connected") {
  throw new Error(`CIT-LMS API smoke check failed (HTTP ${response.status}): database is not confirmed connected`);
}
console.log("CIT-LMS API health check passed. No records were created, changed, or deleted.");
