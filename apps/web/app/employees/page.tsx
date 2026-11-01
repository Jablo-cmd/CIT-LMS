"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

type Employee = {
  id: string; employeeNumber: string; firstName: string; lastName: string;
  employmentType: string; employmentStatus: string; originalHireDate: string;
  currentPosition?: string | null; currentPosting?: { name: string } | null;
  department?: { name: string } | null;
};
type Result = { items: Employee[]; pagination: { page:number; pageSize:number; total:number; pages:number } };

export default function EmployeesPage() {
  const [query,setQuery] = useState("");
  const [status,setStatus] = useState("");
  const [data,setData] = useState<Result | null>(null);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);

  async function load() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if(query.trim()) params.set("q",query.trim());
      if(status) params.set("status",status);
      setData(await api<Result>(`/employees?${params.toString()}`));
    } catch(e) { setError(e instanceof Error ? e.message : "Could not load employee directory"); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ void load(); },[status]);

  return <main className="content">
    <div className="page-heading"><div><p className="eyebrow">WORKFORCE RECORDS</p><h1>Employee directory</h1><p className="lead">Search and review employee records held by CIT.</p></div><span className="count-chip">{data?.pagination.total ?? "—"} records</span></div>
    <section className="panel">
      <div className="toolbar">
        <input aria-label="Search employees" placeholder="Search employee number, name, position or site…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter" && void load()} />
        <select aria-label="Employment status" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="RESIGNED">Resigned</option><option value="DISMISSED">Dismissed</option><option value="DECEASED">Deceased</option>
        </select>
        <button className="secondary-button" onClick={()=>void load()}>Search</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading ? <div className="empty-state">Loading employee records…</div> : data?.items.length ? <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Employee number</th><th>Position</th><th>Posting site</th><th>Employment</th><th>Status</th></tr></thead><tbody>{data.items.map(person=><tr key={person.id}><td><strong>{person.firstName} {person.lastName}</strong><small>{person.department?.name ?? "Department not set"}</small></td><td>{person.employeeNumber}</td><td>{person.currentPosition ?? "—"}</td><td>{person.currentPosting?.name ?? "Head Office / Not assigned"}</td><td>{person.employmentType === "PERMANENT" ? "Permanent" : "Contract"}</td><td><span className={`status status-${person.employmentStatus.toLowerCase()}`}>{person.employmentStatus}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No employee records found</strong><span>Records will appear here after authorised personnel add employees.</span></div>}
    </section>
    <p className="page-note">Employee records are confidential. Access and changes are role-controlled and audited.</p>
  </main>;
}
