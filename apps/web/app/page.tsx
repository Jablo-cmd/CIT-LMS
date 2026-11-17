"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { roleLabel, useSession } from "../components/AppShell";

type EmployeeList = { items: unknown[]; pagination: { total: number } };
type Module = { title: string; description: string; href: string; hideFor?: (role: string) => boolean };

const notAdminPersonnel = (role: string) => role === "ADMIN_PERSONNEL";
const notOwner = (role: string) => role !== "COMPANY_OWNER";

const modules: Module[] = [
  { title: "Employees", description: "Employee directory, profiles and employment history", href: "/employees" },
  { title: "Leave register", description: "Manual leave-form capture, balances and adjustments", href: "/leave" },
  { title: "Posting sites", description: "CIT deployment locations and site administration", href: "/postings" },
  { title: "Work calendar", description: "Working schedules and public holidays", href: "/calendar" },
  { title: "Weekend overtime", description: "Confirmed overtime entries and reporting", href: "/overtime" },
  { title: "Disciplinary records", description: "Restricted hearing records and supporting documents", href: "/disciplinary", hideFor: notAdminPersonnel },
  { title: "Recommendations", description: "Commendations and management recommendations", href: "/recommendations", hideFor: notAdminPersonnel },
  { title: "Documents", description: "Secure employee document register", href: "/documents" },
  { title: "Reports", description: "Workforce, leave and overtime reports", href: "/reports" },
  { title: "User administration", description: "Individual accounts and role permissions", href: "/users", hideFor: notOwner },
  { title: "Audit log", description: "Traceable system activity and changes", href: "/audit", hideFor: notOwner }
];

type SystemState = "checking" | "operational" | "unavailable";

export default function HomePage() {
  const user = useSession();
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [system, setSystem] = useState<SystemState>("checking");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const [employees, health] = await Promise.allSettled([
        api<EmployeeList>("/employees?page=1&pageSize=1"),
        api<{ status?: string }>("/health")
      ]);
      if (!active) return;
      if (employees.status === "fulfilled") setEmployeeCount(employees.value.pagination.total);
      else setError(employees.reason instanceof Error ? employees.reason.message : "Could not load your workspace");
      setSystem(health.status === "fulfilled" && health.value?.status === "ok" ? "operational" : "unavailable");
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const visibleModules = modules.filter(item => !(user && item.hideFor?.(user.role)));
  const firstName = user?.fullName.split(/\s+/)[0];

  return (
    <div className="content">
      <p className="eyebrow">EMPLOYEE MANAGEMENT SYSTEM</p>
      <h1>{firstName ? `Welcome back, ${firstName}` : "Workforce administration"}</h1>
      <p className="lead">A central workspace for employee records, leave, overtime and HR administration.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="welcome">
        <div>
          <p className="eyebrow">CIT BUSINESS SOLUTIONS</p>
          <h2>One reliable record for every employee.</h2>
          <p>Manage employee information through controlled access, clear records and a traceable history of every change.</p>
        </div>
        <img src="/brand/cit-logo-white.png" alt="" className="welcome-logo" />
      </section>
      <div className="stats-grid">
        <article className="stat-card"><span>EMPLOYEE RECORDS</span><strong>{loading ? "…" : employeeCount ?? "—"}</strong><small>Current directory count</small></article>
        <article className="stat-card"><span>YOUR ACCESS</span><strong className="stat-role">{user ? roleLabel(user.role) : "…"}</strong><small>Permissions are based on your role</small></article>
        <article className="stat-card">
          <span>SYSTEM STATUS</span>
          <strong className={`stat-role status-text status-text-${system}`}>{system === "checking" ? "Checking…" : system === "operational" ? "Operational" : "Unavailable"}</strong>
          <small>{system === "unavailable" ? "The service could not be reached" : "Live check of the records service"}</small>
        </article>
      </div>
      <div className="section-title" id="modules"><div><p className="eyebrow">WORKSPACE</p><h2>Management areas</h2></div></div>
      <div className="module-grid">
        {visibleModules.map(item => (
          <Link className="module module-link" href={item.href} key={item.title}>
            <div className="module-top"><span className="module-icon">{item.title.slice(0, 1)}</span><span className="module-arrow" aria-hidden="true">→</span></div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </Link>
        ))}
      </div>
      <footer>CIT Business Solutions <span>·</span> Confidential — authorised personnel only</footer>
    </div>
  );
}
