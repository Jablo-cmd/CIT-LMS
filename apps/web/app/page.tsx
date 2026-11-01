"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";

type SessionUser = { id:string; fullName:string; email:string; role:string };
type EmployeeList = { items: unknown[]; pagination:{total:number} };

const modules = [
  { title:"Employees", description:"Employee directory, profiles and employment history", href:"/employees", state:"Available" },
  { title:"Leave register", description:"Manual leave-form capture, balances and adjustments", href:"/leave", state:"Available" },
  { title:"Posting sites", description:"CIT deployment locations and site administration", href:"/postings", state:"Available" },
  { title:"Weekend overtime", description:"Confirmed overtime entries and reporting", href:"/overtime", state:"Available" },
  { title:"Disciplinary records", description:"Restricted hearing records and supporting documents", href:"/disciplinary", state:"Available" },
  { title:"Recommendations", description:"Commendations and management recommendations", href:"/recommendations", state:"Available" },
  { title:"Documents", description:"Secure employee document register", href:"/documents", state:"Available" },
  { title:"Reports", description:"Workforce, leave and overtime reports", href:"/reports", state:"Available" },\n  { title:"User administration", description:"Individual accounts and role permissions", href:"/users", state:"Available" },\n  { title:"Audit log", description:"Traceable system activity and changes", href:"/audit", state:"Available" }
];

export default function HomePage() {
  const router=useRouter();
  const [user,setUser]=useState<SessionUser|null>(null);
  const [employeeCount,setEmployeeCount]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let active=true;
    async function init(){
      try {
        const session=await api<{user:SessionUser}>("/auth/me");
        const employees=await api<EmployeeList>("/employees?page=1&pageSize=1");
        if(active){setUser(session.user);setEmployeeCount(employees.pagination.total);}
      } catch(e) {
        if(active) {
          if(e instanceof Error && e.message.toLowerCase().includes("authentication")) router.replace("/login");
          else setError(e instanceof Error ? e.message : "Could not load workspace");
        }
      } finally { if(active)setLoading(false); }
    }
    void init();
    return ()=>{active=false;};
  },[router]);

  const visibleModules=modules.filter(item=>!(user?.role==="ADMIN_PERSONNEL"&&["/disciplinary","/recommendations","/users","/audit"].includes(item.href))&&!(user?.role!=="COMPANY_OWNER"&&["/users","/audit"].includes(item.href)));\n\n  async function logout(){
    try { await api("/auth/logout",{method:"POST"}); } finally { router.replace("/login"); router.refresh(); }
  }

  return <main className="layout">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">C</span><div><strong>CIT-LMS</strong><small>People administration</small></div></div>
      <p className="nav-heading">WORKSPACE</p>
      <Link className="nav-link active" href="/">Overview</Link>
      <Link className="nav-link" href="/employees">Employees</Link>
      <p className="nav-heading nav-gap">HR MANAGEMENT</p>
      <a className="nav-link disabled-link" href="#modules">Leave register</a>
      <a className="nav-link disabled-link" href="#modules">Overtime register</a>
      <a className="nav-link disabled-link" href="#modules">Employment history</a>
      <a className="nav-link disabled-link" href="#modules">Documents</a>
      <div className="sidebar-foot"><span className="dot" /> Connected to local API</div>
    </aside>
    <section className="main">
      <header className="topbar"><span>CIT Head Office <span className="muted">/</span> Overview</span><div className="top-actions"><span className="environment">DEVELOPMENT</span>{user&&<span className="user-name">{user.fullName} · {user.role.replaceAll("_"," ")}</span>}<button className="text-button" onClick={logout}>Sign out</button></div></header>
      <div className="content">
        <p className="eyebrow">EMPLOYEE MANAGEMENT SYSTEM</p>
        <h1>Workforce administration</h1>
        <p className="lead">A central workspace for employee records, employment history and HR administration.</p>
        {error&&<p className="form-error">{error}</p>}
        <section className="welcome">
          <div><p className="eyebrow">CIT HR WORKSPACE</p><h2>One reliable record for every employee.</h2><p>Manage employee information through controlled access, clear records and a traceable history of changes.</p></div>
          <div className="welcome-mark">CIT<span>+</span></div>
        </section>
        <div className="stats-grid">
          <article className="stat-card"><span>EMPLOYEE RECORDS</span><strong>{loading?"…":employeeCount??"—"}</strong><small>Current directory count</small></article>
          <article className="stat-card"><span>YOUR ACCESS</span><strong className="stat-role">{user?user.role.replaceAll("_"," "):"…"}</strong><small>Permissions based on your role</small></article>
          <article className="stat-card"><span>DATABASE</span><strong className="stat-role">Connected</strong><small>Live API session verified</small></article>
        </div>
        <div className="section-title" id="modules"><div><p className="eyebrow">SYSTEM AREAS</p><h2>Management modules</h2></div><span className="muted">Build status</span></div>
        <div className="module-grid">{visibleModules.map(item=><Link className="module module-link" href={item.href} key={item.title}><div className="module-top"><span className="module-icon">{item.title.slice(0,1)}</span><span className="module-status available">{item.state}</span></div><h3>{item.title}</h3><p>{item.description}</p></Link>)}</div>
        <footer>CIT-LMS <span>·</span> Internal HR workspace <span>·</span> Use synthetic data during development</footer>
      </div>
    </section>
  </main>;
}
