"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

type LoginResponse =
  | { mfaRequired: true; mfaToken: string }
  | { mfaRequired?: undefined; user: { id: string; email: string; fullName: string; role: string }; mfaEnrollmentRequired?: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(new URLSearchParams(window.location.search).has("expired"));
  }, []);

  function finish(enrolmentRequired?: boolean) {
    router.replace(enrolmentRequired ? "/account/security" : "/");
    router.refresh();
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<LoginResponse>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setPassword("");
      } else {
        finish(result.mfaEnrollmentRequired);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useRecovery ? { mfaToken, recoveryCode: code.trim() } : { mfaToken, code: code.replace(/\s+/g, "") })
      });
      finish();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to verify the code";
      setError(message);
      // An expired challenge cannot be retried: start again from the password.
      if (/expired/i.test(message)) { setMfaToken(null); setCode(""); }
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setMfaToken(null);
    setCode("");
    setUseRecovery(false);
    setError("");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <img src="/brand/cit-logo-tight.png" alt="CIT Business Solutions" className="auth-logo" />
        </div>
        {!mfaToken ? (
          <>
            <h1>Sign in</h1>
            {expired && !error && <p className="form-notice" role="status">Your session has ended. Please sign in again to continue.</p>}
            <form onSubmit={submitPassword} className="auth-form">
              <label>
                Email address
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label>
                Password
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button>
            </form>
          </>
        ) : (
          <>
            <p className="eyebrow">TWO-STEP VERIFICATION</p>
            <h1>Enter your code</h1>
            <p className="auth-intro">
              {useRecovery
                ? "Enter one of your saved recovery codes. Each code works only once."
                : "Open your authenticator app and enter the 6-digit code for CIT-LMS."}
            </p>
            <form onSubmit={submitCode} className="auth-form">
              <label>
                {useRecovery ? "Recovery code" : "Authentication code"}
                <input
                  className="code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode={useRecovery ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  maxLength={useRecovery ? 20 : 7}
                  placeholder={useRecovery ? "XXXXX-XXXXX" : "000 000"}
                  autoFocus
                  required
                />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</button>
            </form>
            <div className="auth-links">
              <button type="button" className="text-button" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(""); }}>
                {useRecovery ? "Use my authenticator app" : "Use a recovery code instead"}
              </button>
              <button type="button" className="text-button" onClick={startOver}>Back to sign in</button>
            </div>
          </>
        )}
        <p className="auth-foot">Access is restricted to authorised company personnel.</p>
      </section>
    </main>
  );
}
