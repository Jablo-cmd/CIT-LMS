import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export type StoredObject = {
  body: Buffer;
  contentType: string;
};

function supabaseHeaders() {
  const key = config.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !config.SUPABASE_URL) throw new Error("Supabase Storage is not configured");
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function objectPath(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function localPath(key: string) {
  const root = path.resolve(config.STORAGE_ROOT);
  const target = path.resolve(root, ...key.split("/"));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error("Invalid private storage key");
  }
  return target;
}

function storageObjectUrl(key: string) {
  const base = config.SUPABASE_URL;
  if (!base) throw new Error("Supabase Storage is not configured");
  return `${base.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(config.SUPABASE_STORAGE_BUCKET)}/${objectPath(key)}`;
}

function storageBucketUrl() {
  const base = config.SUPABASE_URL;
  if (!base) throw new Error("Supabase Storage is not configured");
  return `${base.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(config.SUPABASE_STORAGE_BUCKET)}`;
}

export async function verifyPrivateBucket() {
  if (config.STORAGE_DRIVER !== "supabase") return;
  const response = await fetch(`${config.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/bucket/${encodeURIComponent(config.SUPABASE_STORAGE_BUCKET)}`, {
    headers: supabaseHeaders()
  });
  await assertResponse(response, "bucket verification");
  const bucket = await response.json() as { public?: unknown };
  if (bucket.public !== false) throw new Error("Employee document storage bucket must be private");
}

async function assertResponse(response: Response, action: string) {
  if (!response.ok) throw new Error(`Private document storage ${action} failed (${response.status})`);
}

export async function saveObject(key: string, body: Buffer, contentType: string) {
  if (config.STORAGE_DRIVER === "supabase") {
    const response = await fetch(storageObjectUrl(key), {
      method: "POST",
      headers: { ...supabaseHeaders(), "Content-Type": contentType, "x-upsert": "false" },
      body: new Uint8Array(body)
    });
    await assertResponse(response, "upload");
    return;
  }

  const target = localPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body, { flag: "wx", mode: 0o600 });
}

export async function removeObject(key: string) {
  if (config.STORAGE_DRIVER === "supabase") {
    const response = await fetch(storageBucketUrl(), {
      method: "DELETE",
      headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] })
    });
    await assertResponse(response, "delete");
    return;
  }

  await unlink(localPath(key)).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
}

export async function getObject(key: string): Promise<StoredObject> {
  if (config.STORAGE_DRIVER === "supabase") {
    const base = config.SUPABASE_URL!.replace(/\/$/, "");
    const signResponse = await fetch(`${storageObjectUrl(key).replace("/object/", "/object/sign/")}`, {
      method: "POST",
      headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 })
    });
    await assertResponse(signResponse, "signing");
    const signed = await signResponse.json() as { signedURL?: unknown };
    if (typeof signed.signedURL !== "string") throw new Error("Private document storage returned an invalid signed URL");
    const signedUrl = signed.signedURL.startsWith("http")
      ? signed.signedURL
      : `${base}/storage/v1${signed.signedURL.startsWith("/") ? signed.signedURL : `/${signed.signedURL}`}`;
    const downloadResponse = await fetch(signedUrl);
    await assertResponse(downloadResponse, "download");
    return {
      body: Buffer.from(await downloadResponse.arrayBuffer()),
      contentType: downloadResponse.headers.get("content-type") ?? "application/octet-stream"
    };
  }

  return { body: await readFile(localPath(key)), contentType: "application/octet-stream" };
}

function signedObjectUrl(key: string, downloadName?: string) {
  const url = new URL(storageObjectUrl(key).replace("/object/", "/object/sign/"));
  if (downloadName) url.searchParams.set("download", downloadName);
  return url.toString();
}

export async function createSignedDownloadUrl(key: string, downloadName?: string): Promise<string | null> {
  if (config.STORAGE_DRIVER !== "supabase") return null;
  const response = await fetch(signedObjectUrl(key, downloadName), {
    method: "POST",
    headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 })
  });
  await assertResponse(response, "signing");
  const signed = await response.json() as { signedURL?: unknown };
  if (typeof signed.signedURL !== "string") throw new Error("Private document storage returned an invalid signed URL");
  if (signed.signedURL.startsWith("http")) return signed.signedURL;
  const base = config.SUPABASE_URL!.replace(/\/$/, "");
  return `${base}/storage/v1${signed.signedURL.startsWith("/") ? signed.signedURL : `/${signed.signedURL}`}`;
}