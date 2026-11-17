"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(new URLSearchParams(window.location.search).has("expired"));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api<{ user: { id: string; email: string; fullName: string; role: string } }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
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
          <img src="/brand/cit-logo.png" alt="CIT Business Solutions" className="auth-logo" />
        </div>
        <p className="eyebrow">SECURE WORKSPACE</p>
        <h1>Sign in</h1>
        <p className="auth-intro">Sign in with your individual CIT-LMS account.</p>
        {expired && !error && (
          <p className="form-notice" role="status">Your session has ended. Please sign in again to continue.</p>
        )}
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
