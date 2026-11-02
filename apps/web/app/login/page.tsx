"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "../../lib/supabase/data";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-icon brand-icon--logo">
            <img src="/cit-logo.svg" alt="CIT Business Solutions" width={44} height={44} />
          </span>
          <div>
            <strong>CIT-LMS</strong>
            <small>People administration</small>
          </div>
        </div>
        <p className="eyebrow">SECURE WORKSPACE</p>
        <h1>Welcome back</h1>
        <p className="auth-intro">Sign in with your individual CIT-LMS account.</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            Email address
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy}>{busy ? "Signing in\u2026" : "Sign in securely"}</button>
        </form>
        <p className="auth-foot">Access is restricted to authorised company personnel.</p>
      </section>
    </main>
  );
}
