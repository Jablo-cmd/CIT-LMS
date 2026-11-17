import Link from "next/link";

export default function NotFound() {
  return (
    <main className="notfound-shell">
      <section className="notfound-card">
        <img src="/brand/cit-logo-tight.png" alt="CIT Business Solutions" className="auth-logo" />
        <p className="eyebrow" style={{ marginTop: 26 }}>ERROR 404</p>
        <h1>Page not found</h1>
        <p>The page you are looking for does not exist or has moved. Use the menu to find what you need.</p>
        <Link href="/" className="primary-link">Back to the overview</Link>
      </section>
    </main>
  );
}
