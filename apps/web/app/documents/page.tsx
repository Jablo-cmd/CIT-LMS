"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {API_URL,api} from "../../lib/api";
type Employee={id:string;employeeNumber:string;firstName:string;lastName:string};
type Doc={id:string;employeeId:string;title:string;category:string;originalName:string;sizeBytes:number;uploadedAt:string;employee:Employee;uploadedBy:{fullName:string}};
export default function DocumentsPage(){
 const [items,setItems]=useState<Doc[]>([]),[employees,setEmployees]=useState<Employee[]>([]),[employeeId,setEmployeeId]=useState(""),[error,setError]=useState("");
 async function load(){try{const [d,e]=await Promise.all([api<{items:Doc[]}>("/documents"),api<{items:Employee[]}>("/employees?pageSize=100")]);setItems(d.items);setEmployees(e.items);}catch(x){setError(x instanceof Error?x.message:"Unable to load document register");}}
 useEffect(()=>{void load();},[]);
 function download(doc:Doc){const link=document.createElement("a");link.href=`${API_URL}/documents/${doc.id}/download`;link.rel="noopener";document.body.append(link);link.click();link.remove();}
 const filtered=employeeId?items.filter(x=>x.employeeId===employeeId):items;
 return <main className="content"><div className="page-heading"><div><p className="eyebrow">EMPLOYEE RECORDS</p><h1>Document register</h1><p className="lead">Securely stored employee documents, qualifications and employment records.</p></div><Link href="/" className="back-link">← Dashboard</Link></div>{error&&<p className="form-error">{error}</p>}
 <section className="panel record-panel"><div className="toolbar"><label className="form-field">Filter by employee<select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">All employees</option>{employees.map(x=><option key={x.id} value={x.id}>{x.employeeNumber} · {x.firstName} {x.lastName}</option>)}</select></label><span className="count-chip">{filtered.length} documents</span></div>
 <div className="table-wrap"><table><thead><tr><th>Document</th><th>Employee</th><th>Category</th><th>File</th><th>Uploaded</th><th>Uploaded by</th><th></th></tr></thead><tbody>{filtered.map(doc=><tr key={doc.id}><td><strong>{doc.title}</strong></td><td>{doc.employee.firstName} {doc.employee.lastName}<small>{doc.employee.employeeNumber}</small></td><td>{doc.category.replaceAll("_"," ")}</td><td>{Math.ceil(doc.sizeBytes/1024)} KB</td><td>{new Date(doc.uploadedAt).toLocaleDateString("en-ZA")}</td><td>{doc.uploadedBy.fullName}</td><td><button className="text-button" onClick={()=>void download(doc)}>Download</button></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty-state">No employee documents found. Upload documents from an employee profile.</div>}</div></section>
 <p className="page-note">Files are stored outside public web directories and downloaded through authenticated API routes. Access to identity and disciplinary documents is restricted.</p>
 </main>;
}
