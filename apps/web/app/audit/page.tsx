"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {api} from "../../lib/api";
type Audit={id:string;action:string;entityType:string;entityId?:string|null;createdAt:string;ipAddress?:string|null;user?:{fullName:string;email:string}|null};
export default function AuditPage(){
 const [items,setItems]=useState<Audit[]>([]),[error,setError]=useState("");
 useEffect(()=>{api<{items:Audit[]}>("/audit").then(r=>setItems(r.items)).catch(e=>setError(e instanceof Error?e.message:"Only the Company Owner can view audit logs."));},[]);
 return <main className="content"><div className="page-heading"><div><p className="eyebrow">SECURITY & ACCOUNTABILITY</p><h1>Audit log</h1><p className="lead">Review who created or changed records and when those actions occurred.</p></div><Link href="/" className="back-link">← Dashboard</Link></div>{error&&<p className="form-error">{error}</p>}<section className="panel record-panel"><div className="panel-heading"><h2>Recent system activity</h2><span className="count-chip">{items.length} events</span></div><div className="table-wrap"><table><thead><tr><th>Date and time</th><th>User</th><th>Action</th><th>Record type</th><th>Record ID</th><th>IP address</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{new Date(x.createdAt).toLocaleString("en-ZA")}</td><td>{x.user?.fullName||"System"}</td><td>{x.action}</td><td>{x.entityType}</td><td>{x.entityId||"—"}</td><td>{x.ipAddress||"—"}</td></tr>)}</tbody></table>{!items.length&&!error&&<div className="empty-state">No audit events found.</div>}</div></section></main>;
}