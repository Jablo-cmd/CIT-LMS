"use client";

import { FormEvent,useEffect,useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

type Employee={id:string;employeeNumber:string;firstName:string;lastName:string};
type Site={id:string;name:string;code:string};
type Entry={id:string;workDate:string;startTime:string;finishTime:string;totalHours:string;confirmedBy:string;notes?:string|null;employee:Employee;postingSite?:Site|null;capturedBy:{fullName:string}};
export default function OvertimePage(){
  const [employees,setEmployees]=useState<Employee[]>([]);const [sites,setSites]=useState<Site[]>([]);const [items,setItems]=useState<Entry[]>([]);
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({employeeId:"",postingSiteId:"",workDate:"",startTime:"09:00",finishTime:"13:00",confirmedBy:"",notes:""});
  const [from,setFrom]=useState("");const [to,setTo]=useState("");
  async function load(){
    setError("");
    try{
      const [e,s,t]=await Promise.all([api<{items:Employee[]}>("/employees?pageSize=100"),api<{items:Site[]}>("/postings/sites"),api<{items:Entry[]}>("/overtime")]);
      setEmployees(e.items);setSites(s.items);setItems(t.items);
      if(!form.employeeId&&e.items[0])setForm(f=>({...f,employeeId:e.items[0].id}));
    }catch(err){setError(err instanceof Error?err.message:"Unable to load overtime register");}
  }
  useEffect(()=>{void load();},[]);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{await api("/overtime",{method:"POST",body:JSON.stringify({...form,postingSiteId:form.postingSiteId||undefined})});await load();}
    catch(err){setError(err instanceof Error?err.message:"Could not record overtime");}
    finally{setBusy(false);}
  }
  async function filter(){
    setError("");
    try{const params=new URLSearchParams();if(from)params.set("from",from);if(to)params.set("to",to);const r=await api<{items:Entry[]}>(`/overtime?${params}`);setItems(r.items);}
    catch(err){setError(err instanceof Error?err.message:"Could not filter overtime");}
  }
  const total=items.reduce((n,x)=>n+Number(x.totalHours),0);
  return <main className="content">
    <div className="page-heading"><div><p className="eyebrow">WORKFORCE RECORDS</p><h1>Weekend overtime</h1><p className="lead">Record confirmed weekend work. This register does not calculate overtime pay.</p></div><Link className="back-link" href="/">← Dashboard</Link></div>
    {error&&<p className="form-error">{error}</p>}
    <section className="panel record-panel"><div className="panel-heading"><div><p className="eyebrow">OVERTIME CAPTURE</p><h2>Record weekend overtime</h2></div></div>
      <form className="module-form" onSubmit={submit}><div className="form-grid">
        <label className="form-field">Employee<select required value={form.employeeId} onChange={e=>setForm({...form,employeeId:e.target.value})}><option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.employeeNumber} · {x.firstName} {x.lastName}</option>)}</select></label>
        <label className="form-field">Posting site<select value={form.postingSiteId} onChange={e=>setForm({...form,postingSiteId:e.target.value})}><option value="">Use employee's current / unspecified</option>{sites.map(x=><option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}</select></label>
        <label className="form-field">Work date<input type="date" required value={form.workDate} onChange={e=>setForm({...form,workDate:e.target.value})}/></label>
        <label className="form-field">Start time<input type="time" required value={form.startTime} onChange={e=>setForm({...form,startTime:e.target.value})}/></label>
        <label className="form-field">Finish time<input type="time" required value={form.finishTime} onChange={e=>setForm({...form,finishTime:e.target.value})}/></label>
        <label className="form-field">Manager who confirmed<input required value={form.confirmedBy} onChange={e=>setForm({...form,confirmedBy:e.target.value})}/></label>
      </div><label className="form-field">Notes<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><button className="primary-button" disabled={busy}>{busy?"Saving…":"Save overtime entry"}</button></form>
      <p className="form-hint">The system accepts Saturday and Sunday entries only. It calculates elapsed hours from the recorded start and finish times.</p>
    </section>
    <section className="panel record-panel"><div className="panel-heading"><div><p className="eyebrow">OVERTIME REPORT</p><h2>Recorded entries</h2></div><div className="overtime-total"><strong>{total.toFixed(2)} hrs</strong><small>in current result</small></div></div>
      <div className="toolbar"><label className="form-field">From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="form-field">To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="secondary-button" onClick={()=>void filter()}>Apply dates</button><button className="text-button" onClick={()=>{setFrom("");setTo("");void load();}}>Clear</button></div>
      <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Work date</th><th>Site</th><th>Time</th><th>Hours</th><th>Confirmed by</th><th>Captured by</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td><strong>{x.employee.firstName} {x.employee.lastName}</strong><small>{x.employee.employeeNumber}</small></td><td>{new Date(x.workDate).toLocaleDateString("en-ZA")}</td><td>{x.postingSite?.name||"—"}</td><td>{x.startTime} – {x.finishTime}</td><td>{x.totalHours}</td><td>{x.confirmedBy}</td><td>{x.capturedBy.fullName}</td></tr>)}</tbody></table>{!items.length&&<div className="empty-state">No overtime records found.</div>}</div>
    </section>
  </main>;
}
