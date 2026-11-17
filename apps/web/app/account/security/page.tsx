"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

type Status = { enabled: boolean; enrolledAt: string | null; required: boolean; recoveryCodesRemaining: number };
type Setup = { secret: string; otpauthUri: string; qrDataUrl: string };

const groupKey = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

export default function SecurityPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [manage, setManage] = useState<"none" | "regenerate" | "disable">("none");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try { setStatus(await api<Status>("/auth/mfa/status")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load your security settings"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function reset() { setCode(""); setPassword(""); setError(""); }

  async function startSetup() {
    reset(); setNotice(""); setBusy(true);
    try { setSetup(await api<Setup>("/auth/mfa/setup", { method: "POST", body: JSON.stringify({}) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not start the setup"); }
    finally { setBusy(false); }
  }

  async function confirmSetup(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await api<{ recoveryCodes: string[] }>("/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code: code.replace(/\s+/g, "") }) });
      setRecoveryCodes(result.recoveryCodes); setSetup(null); setCode("");
    } catch (e) { setError(e instanceof Error ? e.message : "That code was not accepted"); }
    finally { setBusy(false); }
  }

  async function regenerate(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await api<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { method: "POST", body: JSON.stringify({ code: code.replace(/\s+/g, "") }) });
      setRecoveryCodes(result.recoveryCodes); setManage("none"); reset();
    } catch (e) { setError(e instanceof Error ? e.message : "That code was not accepted"); }
    finally { setBusy(false); }
  }

  async function disable(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      await api("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ password, code: code.replace(/\s+/g, "") }) });
      setManage("none"); reset(); setNotice("Two-step verification has been turned off."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not turn it off"); }
    finally { setBusy(false); }
  }

  async function copyCodes() {
    if (!recoveryCodes) return;
    try { await navigator.clipboard.writeText(recoveryCodes.join("\n")); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setError("Copying is not available in this browser. Download the codes instead."); }
  }

  function downloadCodes() {
    if (!recoveryCodes) return;
    const text = `CIT-LMS recovery codes\nEach code can be used once if you lose access to your authenticator app.\nKeep this file somewhere safe and private.\n\n${recoveryCodes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url; link.download = "cit-lms-recovery-codes.txt"; link.click();
    URL.revokeObjectURL(url);
  }

  function finishCodes() {
    setRecoveryCodes(null);
    // A required enrolment unlocks the rest of the app, so reload to pick up the new session.
    if (status?.required && !status.enabled) window.location.assign("/");
    else void load();
  }

  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PERSONAL SECURITY</p>
          <h1>Two-step verification</h1>
          <p className="lead">Protect your account with a code from an authenticator app, in addition to your password.</p>
        </div>
        <Link href="/account" className="back-link">← My account</Link>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}

      {recoveryCodes ? (
        <section className="panel record-panel">
          <p className="eyebrow">SAVE YOUR RECOVERY CODES</p>
          <h2>Keep these somewhere safe</h2>
          <p className="form-hint">If you lose your phone, each of these codes lets you sign in once. They are shown only now. Store them in a password manager or print them.</p>
          <div className="recovery-grid" aria-label="Recovery codes">
            {recoveryCodes.map(c => <code key={c}>{c}</code>)}
          </div>
          <div className="form-actions" style={{ justifyContent: "flex-start" }}>
            <button className="secondary-button" onClick={() => void copyCodes()}>{copied ? "Copied ✓" : "Copy codes"}</button>
            <button className="secondary-button" onClick={downloadCodes}>Download as file</button>
            <button className="primary-button" onClick={finishCodes}>I have saved my codes</button>
          </div>
        </section>
      ) : !status ? (
        <div className="empty-state">Loading your security settings…</div>
      ) : status.enabled ? (
        <>
          <section className="panel record-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">STATUS</p><h2>Two-step verification is on</h2></div>
              <span className="status status-active">ON</span>
            </div>
            <p className="form-hint">
              {status.enrolledAt ? `Turned on ${new Date(status.enrolledAt).toLocaleDateString("en-ZA")}. ` : ""}
              You have {status.recoveryCodesRemaining} unused recovery code{status.recoveryCodesRemaining === 1 ? "" : "s"}.
              {status.recoveryCodesRemaining <= 2 ? " Consider generating a new set." : ""}
            </p>
            {manage === "none" && (
              <div className="form-actions" style={{ justifyContent: "flex-start" }}>
                <button className="secondary-button" onClick={() => { reset(); setNotice(""); setManage("regenerate"); }}>Generate new recovery codes</button>
                {!status.required && <button className="text-button" onClick={() => { reset(); setNotice(""); setManage("disable"); }}>Turn off</button>}
              </div>
            )}
            {manage === "regenerate" && (
              <form className="module-form" onSubmit={regenerate}>
                <p className="form-hint">Enter the current code from your authenticator app. Your old recovery codes will stop working.</p>
                <label className="form-field">Authentication code<input className="code-input" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000 000" required autoFocus /></label>
                <div className="form-actions" style={{ justifyContent: "flex-start" }}>
                  <button className="primary-button" disabled={busy}>{busy ? "Working…" : "Generate codes"}</button>
                  <button type="button" className="text-button" onClick={() => { setManage("none"); reset(); }}>Cancel</button>
                </div>
              </form>
            )}
            {manage === "disable" && (
              <form className="module-form" onSubmit={disable}>
                <p className="form-hint">Confirm with your password and a current code to turn off two-step verification.</p>
                <div className="form-grid two-col">
                  <label className="form-field">Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
                  <label className="form-field">Authentication code<input className="code-input" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000 000" required /></label>
                </div>
                <div className="form-actions" style={{ justifyContent: "flex-start" }}>
                  <button className="primary-button" disabled={busy}>{busy ? "Working…" : "Turn off"}</button>
                  <button type="button" className="text-button" onClick={() => { setManage("none"); reset(); }}>Cancel</button>
                </div>
              </form>
            )}
          </section>
        </>
      ) : setup ? (
        <section className="panel record-panel">
          <p className="eyebrow">STEP 2 OF 2</p>
          <h2>Scan the code, then confirm</h2>
          <div className="security-grid">
            <div className="qr-box">
              <img src={setup.qrDataUrl} alt="QR code to add CIT-LMS to your authenticator app" width={224} height={224} />
              <p className="form-hint">Can't scan? Enter this key manually:</p>
              <code className="secret-key">{groupKey(setup.secret)}</code>
            </div>
            <form className="module-form" onSubmit={confirmSetup}>
              <ol className="steps">
                <li>Open an authenticator app such as Microsoft Authenticator or Google Authenticator.</li>
                <li>Add an account and scan the QR code (or enter the key).</li>
                <li>Type the 6-digit code the app shows to finish.</li>
              </ol>
              <label className="form-field">Authentication code<input className="code-input" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000 000" required autoFocus /></label>
              <div className="form-actions" style={{ justifyContent: "flex-start" }}>
                <button className="primary-button" disabled={busy}>{busy ? "Checking…" : "Confirm and turn on"}</button>
                <button type="button" className="text-button" onClick={() => { setSetup(null); reset(); }}>Cancel</button>
              </div>
            </form>
          </div>
        </section>
      ) : (
        <section className="panel record-panel">
          {status.required && <p className="form-notice" role="status"><strong>Two-step verification is required.</strong> Set it up now to continue using CIT-LMS.</p>}
          <p className="eyebrow">STEP 1 OF 2</p>
          <h2>Turn on two-step verification</h2>
          <p className="form-hint">You'll need an authenticator app on your phone. After setup, signing in asks for a 6-digit code as well as your password, so a stolen password alone can't open your account.</p>
          <div className="form-actions" style={{ justifyContent: "flex-start" }}>
            <button className="primary-button" onClick={() => void startSetup()} disabled={busy}>{busy ? "Starting…" : "Set up authenticator app"}</button>
          </div>
        </section>
      )}
    </main>
  );
}
