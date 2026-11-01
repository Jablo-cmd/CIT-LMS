"use client";

import { FormEvent,useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api";

type RefItem={id:string;name:string;code?:string};
export default function NewEmployeePage(){
  const router=useRouter();
  const [departments,setDepartments]=useState<RefItem[]>([]);
  const [sites,setSites]=useState<RefItem[]>([]);
  const [schedules,setSchedules]=useState<RefItem[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [form,setForm]=useState({
    employeeNumber:"",firstName:"",lastName:"",nationality:"South African",
    addressStreet:"",addressSuburb:"",addressCity:"",addressProvince:"",addressPostalCode:"",
    phone:"",email:"",employmentType:"PERMANENT",employmentStatus:"ACTIVE",
    originalHireDate:"",contractStartDate:"",contractEndDate:"",
    departmentId:"",workingScheduleId:""
  });
  useEffect(()=>{
    Promise.all([
      api<{items:RefItem[]}>("/postings/departments"),
      api<{items:RefItem[]}>("/postings/sites"),
      api<{items:RefItem[]}>("/calendar/schedules")
    ]).then(([d,s,w])=>{setDepartments(d.items);setSites(s.items);setSchedules(w.items);})
      .catch(e=>setError(e instanceof Error?e.message:"Unable to load reference lists"));
  },[]);
  function set<K extends keyof typeof form>(key:K,value:string){setForm(old=>({...old,[key]:value}));}
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{
      const payload={...form,originalHireDate:form.originalHireDate,contractStartDate:form.contractStartDate||undefined,contractEndDate:form.contractEndDate||undefined,
        departmentId:form.departmentId||undefined,workingScheduleId:form.workingScheduleId||undefined,email:form.email||undefined};
      const result=await api<{employee:{id:string}}>("/employees",{method:"POST",body:JSON.stringify(payload)});
      router.push(`/employees/${result.employee.id}`);
    }catch(err){setError(err instanceof Error?err.message:"Could not create employee");}
    finally{setBusy(false);}
  }
  const field=(label:string,key:keyof typeof form,type="text",required=false)=><label className="form-field">{label}<input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} required={required}/></label>;
  return <main className="content">
    <div className="page-heading"><div><p className="eyebrow">WORKFORCE RECORDS</p><h1>Add employee</h1><p className="lead">Create a new employee record. The employee number must match CIT's existing numbering convention.</p></div><Link className="back-link" href="/employees">← Employee directory</Link></div>
    <form className="panel employee-form" onSubmit={submit}>
      <section className="form-section"><h2>Personal information</h2><div className="form-grid">
        {field("Employee number","employeeNumber","text",true)}{field("First name","firstName","text",true)}{field("Last name","lastName","text",true)}{field("Nationality","nationality")}
        {field("Phone number","phone")}{field("Email address","email","email")}
      </div></section>
      <section className="form-section"><h2>Residential address</h2><div className="form-grid">
        {field("Street address","addressStreet")}{field("Suburb","addressSuburb")}{field("City","addressCity")}{field("Province","addressProvince")}{field("Postal code","addressPostalCode")}
      </div></section>
      <section className="form-section"><h2>Employment information</h2><div className="form-grid">
        <label className="form-field">Employment type<select value={form.employmentType} onChange={e=>set("employmentType",e.target.value)}><option value="PERMANENT">Permanent</option><option value="CONTRACT">Contract</option></select></label>
        <label className="form-field">Employment status<select value={form.employmentStatus} onChange={e=>set("employmentStatus",e.target.value)}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label>
        {field("Original CIT hire date","originalHireDate","date",true)}
        {form.employmentType==="CONTRACT"&&<>{field("Contract start date","contractStartDate","date",true)}{field("Contract expiry date","contractEndDate","date")}</>}
        <label className="form-field">Department<select value={form.departmentId} onChange={e=>set("departmentId",e.target.value)}><option value="">Select department</option>{departments.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="form-field">Working schedule<select value={form.workingScheduleId} onChange={e=>set("workingScheduleId",e.target.value)}><option value="">Use standard weekday schedule</option>{schedules.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div></section>
      <p className="form-hint">After creating the employee record, upload the appointment or posting document, then record the initial position and posting in the employment history.</p>
      {error&&<p className="form-error">{error}</p>}
      <div className="form-actions"><Link className="back-link" href="/employees">Cancel</Link><button className="primary-button" disabled={busy}>{busy?"Saving employee…":"Create employee record"}</button></div>
    </form>
  </main>;
}
