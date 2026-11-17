"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="notfound-shell">
      <section className="notfound-card">
        <img src="/brand/cit-logo-tight.png" alt="CIT Business Solutions" className="auth-logo" />
        <p className="eyebrow" style={{ marginTop: 26 }}>SOMETHING WENT WRONG</p>
        <h1>We could not load this page</h1>
        <p>This is usually temporary. Try again, and if it keeps happening contact your system administrator.</p>
        <button className="primary-button" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
