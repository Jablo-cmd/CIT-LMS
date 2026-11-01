const modules = [
  ["Employees", "Employee directory, profiles and employment history", "Foundation"],
  ["Leave register", "Manual leave-form capture, balances and adjustments", "Planned"],
  ["Posting history", "Appointments, position changes and site transfers", "Planned"],
  ["Weekend overtime", "Confirmed overtime entries and reporting", "Planned"],
  ["Disciplinary records", "Restricted hearing records and supporting documents", "Planned"],
  ["Recommendations", "Commendations and management recommendations", "Planned"],
  ["Documents", "Secure employee document register", "Planned"],
  ["Reports", "Workforce, leave and overtime reports", "Planned"]
] as const;

export default function HomePage() {
  return <main className="layout">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">C</span><div><strong>CIT-LMS</strong><small>People administration</small></div></div>
      <p className="nav-heading">WORKSPACE</p>
      <a className="nav-link active" href="/">Overview</a>
      <a className="nav-link" href="#modules">System modules</a>
      <div className="sidebar-foot"><span className="dot" /> Local development workspace</div>
    </aside>
    <section className="main">
      <header className="topbar"><span>CIT Head Office <span className="muted">/</span> Overview</span><span className="environment">DEVELOPMENT</span></header>
      <div className="content">
        <p className="eyebrow">EMPLOYEE MANAGEMENT SYSTEM</p>
        <h1>Workforce administration</h1>
        <p className="lead">A central workspace for employee records, employment history and HR administration.</p>
        <section className="welcome">
          <div><p className="eyebrow">PROJECT FOUNDATION</p><h2>One reliable record for every employee.</h2><p>The system is being built around CIT's agreed HR processes, with controlled access and a traceable history of changes.</p></div>
          <div className="welcome-mark">CIT<span>+</span></div>
        </section>
        <div className="section-title" id="modules"><div><p className="eyebrow">SYSTEM AREAS</p><h2>Management modules</h2></div><span className="muted">Implementation roadmap</span></div>
        <div className="module-grid">{modules.map(([title, description, status]) => <article className="module" key={title}><div className="module-top"><span className="module-icon">{title.slice(0,1)}</span><span className="module-status">{status}</span></div><h3>{title}</h3><p>{description}</p></article>)}</div>
        <footer>CIT-LMS <span>·</span> Internal system foundation <span>·</span> No live employee data</footer>
      </div>
    </section>
  </main>;
}
