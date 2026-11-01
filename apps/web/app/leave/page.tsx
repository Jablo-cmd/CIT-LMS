"use client";

import { FormEvent,useEffect,useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

type Employee={id:string;employeeNumber:string;firstName:string;lastName:string};
type Policy={id:string;category:string;name:string;entitlementDays:string|null;effectiveFrom:string;effectiveTo:string|null;employmentType:string|null;isActive:boolean};
type EmployeeDoc={id:string;title:string;category:string};
type BalanceRow={employee:Employee;balances:Record<string,number>};
type Transaction={id:string;category:string;type:string;days:string;firstLeaveDate?:string|null;lastLeaveDate?:string|null;capturedAt:string;reason?:string|null;employee:Employee;capturedBy:{fullName:string}};
const categories=["ANNUAL","SICK","FAMILY_RESPONSIBILITY","MATERNITY","PATERNITY_PARENTAL","UNPAID","STUDY","OTHER"];
const label=(s:string)=>s.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
export default function LeavePage(){
  const [employees,setEmployees]=useState<Employee[]>([]);const [policies,setPolicies]=useState<Policy[]>([]);const [items,setItems]=useState<Transaction[]>([]);const [balanceRows,setBalanceRows]=useState<BalanceRow[]>([]);const [employeeDocs,setEmployeeDocs]=useState<EmployeeDoc[]>([]);
  const [role,setRole]=useState("");const [error,setError]=useState("");const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);
  const [employeeId,setEmployeeId]=useState("");const [category,setCategory]=useState("ANNUAL");const [first,setFirst]=useState("");const [last,setLast]=useState("");const [formDate,setFormDate]=useState("");
  const [preview,setPreview]=useState<number|null>(null);const [reason,setReason]=useState("");const [ref,setRef]=useState("");const [supportingDocumentId,setSupportingDocumentId]=useState("");
  const [opening,setOpening]=useState({employeeId:"",category:"ANNUAL",days:"",reason:"Opening balance verified against CIT leave records"});
  const [policy,setPolicy]=useState({category:"ANNUAL",name:"Annual leave",entitlementDays:"",accrualPerMonth:"",employmentType:"",effectiveFrom:new Date().toISOString().slice(0,10),effectiveTo:"",carryOverLimit:""});
  async function load(){
    setError("");
    try{
      const [emp,tx,me]=await Promise.all([api<{items:Employee[]}>("/employees?pageSize=100"),api<{items:Transaction[]}>("/leave/transactions"),api<{user:{role:string}}>("/auth/me")]);
      setEmployees(emp.items);setItems(tx.items);setRole(me.user.role);
      if(!employeeId&&emp.items[0]){setEmployeeId(emp.items[0].id);setOpening(o=>({...o,employeeId:emp.items[0].id}));}
      if(me.user.role!=="ADMIN_PERSONNEL"){const p=await api<{items:Policy[]}>("/leave/policies");setPolicies(p.items);}
    }catch(e){setError(e instanceof Error?e.message:"Could not load leave register");}
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{if(employeeId){api<{items:EmployeeDoc[]}>(`/documents/employee/${employeeId}`).then(r=>setEmployeeDocs(r.items)).catch(()=>setEmployeeDocs([]));setSupportingDocumentId("");}},[employeeId]);
  async function calculate(){
    setError("");setPreview(null);
    try{const result=await api<{workingDays:number}>("/leave/calculate",{method:"POST",body:JSON.stringify({employeeId,firstLeaveDate:first,lastLeaveDate:last})});setPreview(result.workingDays);}
    catch(e){setError(e instanceof Error?e.message:"Could not calculate leave days");}
  }
  async function capture(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{await api("/leave/transactions",{method:"POST",body:JSON.stringify({employeeId,category,firstLeaveDate:first,lastLeaveDate:last,formSubmissionDate:formDate||undefined,reason,referenceNumber:ref,supportingDocumentId})});setPreview(null);setFirst("");setLast("");setReason("");setRef("");await load();}
    catch(e){setError(e instanceof Error?e.message:"Could not capture leave transaction");}
    finally{setBusy(false);}
  }
  async function openingBalance(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{await api(`/leave/balances/${opening.employeeId}/adjust`,{method:"POST",body:JSON.stringify({category:opening.category,days:Number(opening.days),reason:opening.reason})});setOpening(o=>({...o,days:""}));await load();}
    catch(e){setError(e instanceof Error?e.message:"Could not adjust leave balance");}
    finally{setBusy(false);}
  }
  async function runAccrual(){setBusy(true);setError("");setNotice("");try{const now=new Date();const result=await api<{entriesCreated:number}>("/leave/accruals/run",{method:"POST",body:JSON.stringify({year:now.getFullYear(),month:now.getMonth()+1})});setNotice(`Monthly accrual completed: ${result.entriesCreated} ledger entries created.`);await load();}catch(e){setError(e instanceof Error?e.message:"Could not run monthly accrual");}finally{setBusy(false);}}
  async function createPolicy(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{await api("/leave/policies",{method:"POST",body:JSON.stringify({category:policy.category,name:policy.name,entitlementDays:policy.entitlementDays?Number(policy.entitlementDays):undefined,accrualPerMonth:policy.accrualPerMonth?Number(policy.accrualPerMonth):undefined,employmentType:policy.employmentType||undefined,effectiveFrom:policy.effectiveFrom,effectiveTo:policy.effectiveTo||undefined,carryOverLimit:policy.carryOverLimit?Number(policy.carryOverLimit):undefined})});await load();}
    catch(e){setError(e instanceof Error?e.message:"Could not save leave policy");}
    finally{setBusy(false);}
  }
  return <main className="content">
    <div className="page-heading"><div><p className="eyebrow">HR RECORDS</p><h1>Leave register</h1><p className="lead">Capture leave from submitted paper forms and maintain an auditable balance ledger.</p></div><Link className="back-link" href="/">← Dashboard</Link></div>
    {error&&<p className="form-error">{error}</p>}{notice&&<p className="success-message">{notice}</p>}
    <section className="panel record-panel"><div className="panel-heading"><div><p className="eyebrow">MANUAL FORM CAPTURE</p><h2>Record employee leave</h2></div>{role!=="ADMIN_PERSONNEL"&&<button type="button" className="secondary-button" onClick={()=>void runAccrual()} disabled={busy}>Run current-month accrual</button>}</div>
      <form className="module-form" onSubmit={capture}>
        <div className="form-grid"><label className="form-field">Employee<select required value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.employeeNumber} · {x.firstName} {x.lastName}</option>)}</select></label>
          <label className="form-field">Leave category<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label>
          <label className="form-field">First leave date<input type="date" required value={first} onChange={e=>{setFirst(e.target.value);setPreview(null);}}/></label>
          <label className="form-field">Last leave date<input type="date" required value={last} onChange={e=>{setLast(e.target.value);setPreview(null);}}/></label>
          <label className="form-field">Paper form submission date<input type="date" value={formDate} onChange={e=>setFormDate(e.target.value)}/></label>
          <label className="form-field">Form reference number<input value={ref} onChange={e=>setRef(e.target.value)}/></label><label className="form-field">Supporting leave form<select required value={supportingDocumentId} onChange={e=>setSupportingDocumentId(e.target.value)}><option value="">Select uploaded employee document</option>{employeeDocs.map(d=><option key={d.id} value={d.id}>{d.title} · {label(d.category)}</option>)}</select></label>
        </div>
        <label className="form-field">Notes / reason<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <div className="preview-row"><button type="button" className="secondary-button" onClick={()=>void calculate()} disabled={!employeeId||!first||!last}>Preview working days</button>{preview!==null&&<strong>{preview} working day(s) will be deducted</strong>}</div>
        <button className="primary-button" disabled={busy||preview===null||preview<1||!supportingDocumentId}>{busy?"Saving…":"Save leave transaction"}</button>
      </form>
      <p className="form-hint">Leave is not applied for or approved in this system. HR/admin personnel capture the submitted form. The system calculates scheduled working days using the employee calendar and configured public holidays.</p>
    </section>
    {role!=="ADMIN_PERSONNEL"&&<div className="two-panel">
      <section className="panel record-panel"><div className="panel-heading"><h2>Opening balance / adjustment</h2></div><form className="module-form" onSubmit={openingBalance}>
        <label className="form-field">Employee<select required value={opening.employeeId} onChange={e=>setOpening({...opening,employeeId:e.target.value})}><option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.employeeNumber} · {x.firstName} {x.lastName}</option>)}</select></label>
        <label className="form-field">Category<select value={opening.category} onChange={e=>setOpening({...opening,category:e.target.value})}>{categories.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label>
        <label className="form-field">Days to add / subtract<input type="number" step="0.5" required value={opening.days} onChange={e=>setOpening({...opening,days:e.target.value})}/></label>
        <label className="form-field">Reason<input required value={opening.reason} onChange={e=>setOpening({...opening,reason:e.target.value})}/></label>
        <button className="primary-button" disabled={busy||!opening.employeeId}>Post adjustment</button>
      </form></section>
      <section className="panel record-panel"><div className="panel-heading"><h2>Leave policies</h2></div><div className="policy-list">{policies.map(p=><div className="doc-row" key={p.id}><div><strong>{p.name} · {label(p.category)}</strong><small>{p.employmentType||"All employment types"} · From {new Date(p.effectiveFrom).toLocaleDateString("en-ZA")} · {p.entitlementDays??"Policy based"} days</small></div><span className="status status-active">{p.isActive?"Active":"Inactive"}</span></div>)}{!policies.length&&<div className="empty-state">No leave policies configured. Add the CIT-approved policy details below.</div>}</div>
        <form className="module-form inline-form" onSubmit={createPolicy}><h3>Add leave policy</h3><div className="form-grid two-col"><label className="form-field">Category<select value={policy.category} onChange={e=>setPolicy({...policy,category:e.target.value})}>{categories.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label><label className="form-field">Policy name<input required value={policy.name} onChange={e=>setPolicy({...policy,name:e.target.value})}/></label><label className="form-field">Entitlement days<input type="number" step="0.5" value={policy.entitlementDays} onChange={e=>setPolicy({...policy,entitlementDays:e.target.value})}/></label><label className="form-field">Accrual per month<input type="number" step="0.01" value={policy.accrualPerMonth} onChange={e=>setPolicy({...policy,accrualPerMonth:e.target.value})}/></label><label className="form-field">Employment type<select value={policy.employmentType} onChange={e=>setPolicy({...policy,employmentType:e.target.value})}><option value="">All</option><option value="PERMANENT">Permanent</option><option value="CONTRACT">Contract</option></select></label><label className="form-field">Effective from<input type="date" required value={policy.effectiveFrom} onChange={e=>setPolicy({...policy,effectiveFrom:e.target.value})}/></label><label className="form-field">Effective to<input type="date" value={policy.effectiveTo} onChange={e=>setPolicy({...policy,effectiveTo:e.target.value})}/></label><label className="form-field">Carry-over limit<input type="number" step="0.5" value={policy.carryOverLimit} onChange={e=>setPolicy({...policy,carryOverLimit:e.target.value})}/></label></div><button className="primary-button" disabled={busy}>Save policy</button></form>
      </section>
    </div>}
    <section className="panel record-panel"><div className="panel-heading"><div><p className="eyebrow">CURRENT BALANCES</p><h2>Employee leave balances</h2></div><span className="count-chip">{balanceRows.length} employees</span></div><div className="table-wrap"><table><thead><tr><th>Employee</th><th>Annual</th><th>Sick</th><th>Family responsibility</th><th>Maternity</th><th>Paternity / parental</th><th>Study</th><th>Other</th></tr></thead><tbody>{balanceRows.map(row=><tr key={row.employee.id}><td><strong>{row.employee.firstName} {row.employee.lastName}</strong><small>{row.employee.employeeNumber}</small></td>{["ANNUAL","SICK","FAMILY_RESPONSIBILITY","MATERNITY","PATERNITY_PARENTAL","STUDY","OTHER"].map(cat=><td key={cat}>{(row.balances[cat]??0).toFixed(2)}</td>)}</tr>)}</tbody></table>{!balanceRows.length&&<div className="empty-state">No employee balances available.</div>}</div></section>
    <section className="panel record-panel"><div className="panel-heading"><div><p className="eyebrow">AUDITABLE LEDGER</p><h2>Recent leave transactions</h2></div><span className="count-chip">{items.length} entries</span></div>
      <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Category</th><th>Transaction</th><th>Days</th><th>Leave dates</th><th>Captured</th><th>Captured by</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td><strong>{x.employee.firstName} {x.employee.lastName}</strong><small>{x.employee.employeeNumber}</small></td><td>{label(x.category)}</td><td>{label(x.type)}</td><td>{x.days}</td><td>{x.firstLeaveDate?new Date(x.firstLeaveDate).toLocaleDateString("en-ZA"):"—"}{x.lastLeaveDate? ` – ${new Date(x.lastLeaveDate).toLocaleDateString("en-ZA")}`:""}</td><td>{new Date(x.capturedAt).toLocaleDateString("en-ZA")}</td><td>{x.capturedBy.fullName}</td></tr>)}</tbody></table>{!items.length&&<div className="empty-state">No leave transactions have been captured.</div>}</div>
    </section>
  </main>;
}
