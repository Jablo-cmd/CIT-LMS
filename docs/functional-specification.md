# CIT-LMS Functional Specification

**Status:** Initial consolidated specification  
**System:** CIT Employee Management & Leave Records System  
**Repository:** Jablo-cmd/CIT-LMS

## 1. Purpose

Provide CIT Head Office, HR, and authorised administration personnel with a central, auditable digital register for employee information and employment records, leave transactions, weekend overtime, disciplinary matters, recommendations, and employee documents.

The application records and organises information. It does not replace CIT's existing manual leave application and approval process.

## 2. Explicit exclusions

The system will not include:
- Payroll, salary amounts, salary history, or salary adjustments.
- Attendance or clock-in/clock-out tracking.
- Employee self-service accounts or employee leave applications.
- Digital leave approval or approval decision workflows.
- Overtime pay calculations.
- Unrequested legacy workflows copied from the previous system.

## 3. User roles and access

### Company Owner
Full access to all modules, records, documents, reports, settings, audit history, and user administration. Only this role manages user accounts.

### HR Manager
Manages employee profiles, employment and posting history, leave records and policies, overtime records, disciplinary records, recommendations, documents, and reports. Cannot manage user accounts.

### Administrative Personnel
Operational capture role. May view employee records subject to sensitive-data restrictions; create employee records; capture leave transactions and overtime; edit routine records; upload employee documents; and view permitted reports. Cannot change employment status, positions, postings, or leave policies, and cannot manage user accounts. Disciplinary access is restricted by permission.

Each person has an individual account. The system records the user responsible for creating or changing records. Sensitive records and important changes require access controls and audit history.

## 4. Employee records

### 4.1 Personal information
- First name and surname.
- Employee number, entered by CIT using its existing numbering convention.
- Nationality.
- Employee photograph (JPG or PNG).
- Residential address: street, suburb, city, province, postal code.
- Phone number and email address.

Employee number must be unique, checked before saving, and not casually editable after creation. It is the principal human-readable identifier throughout the system. Employee photos appear on profiles and in the directory; authorised users can replace a photo, with the update date recorded. A placeholder may be displayed if a photo is temporarily unavailable, although a photo is expected for every employee.

### 4.2 Employment information
- Employment type: Permanent or Contract.
- Employment status: Active, Suspended, Resigned, Dismissed, or Deceased.
- Original date first employed by CIT.
- Contract start and expiry dates where applicable.
- Department.
- Official employment position.
- Current posting/site assignment and actual role performed at that posting, where applicable.
- Length of service calculated from the original CIT employment date.

The original CIT employment date is retained as the immutable service-start date and must not be overwritten during ordinary updates. Distinguish an employee's official employment position from the role performed at a particular deployment site where those differ.

### 4.3 Employment and posting history
Maintain a chronological history from initial appointment to the present. Record the initial position and posting, then each subsequent change as a separate historical event. Position changes and posting transfers may happen independently or together.

Each event records:
- Employee.
- Previous and new position, where applicable.
- Previous and new posting, where applicable.
- Effective/assumption-of-duty date and date recorded.
- Reason and notes.
- Responsible/relevant manager.
- HR officer who captured the event.
- Supporting official document.

A supporting document is mandatory before a position change or posting transfer can be finalised. Attach the document to the specific history event, not merely to a general employee folder. Historical entries must not be overwritten. The current employee profile reflects the latest effective assignment.

### 4.4 Next of kin
Support multiple contacts per employee, with full name, relationship, contact number, optional additional contact details, and an indication of the primary contact.

### 4.5 Employee document folder
Provide categories for:
1. Academic qualifications.
2. Professional certificates.
3. Training certificates.
4. Identity and personal documents.
5. Employment documents.
6. Other supporting documents.

Supported formats: PDF, Word, JPG, PNG. Store title, category, upload date, attachment, and optional description. HR can upload, view, and download. Management access follows permissions. Documents linked to employment-history events remain attached to those events.

## 5. Employee directory and search

Provide a searchable employee directory with photographs. Search/filter by:
- Employee number.
- First name and surname.
- Position/job title.
- Posting site.
- Employment status.

Allow combined filters and sorting.

## 6. Organisation and posting sites

CIT Head Office is the central organisation. Head Office employees have a profile but do not require an external posting assignment. HR and management administer the organisation centrally.

Initial posting-site seed data (verify operational details before production use):
| Code | Site | Address |
|---|---|---|
| TCM-01 | TCM | 45 Rivonia Road, Sandton, Johannesburg, Gauteng |
| MRV-01 | Maravi | 14 Marshall Street, Johannesburg |
| PTC-01 | Portuguese Consulate | 851 Church Street, Arcadia, Pretoria, Gauteng |
| SUN-01 | Sun City Main Site | 1 Sun City Drive, Sun City, Rustenburg, North West |
| SUN-02 | Sandton Office | 30 Baker Street, 5th Floor, Rosebank, Johannesburg, Gauteng |
| ENT-01 | Entellect | 23 Cato Road, Waverley, Johannesburg, Gauteng |

HR-authorised users can add posting sites later. Keep posting history with start/end dates; do not overwrite previous assignments. Record the manager responsible for each site assignment and preserve relevant manager history.

Initial department/job-title examples from the previous data model may be used as reference values, not assumed to be a final approved master list:
- Departments: Operations, Cash Services, Client Liaison, IT & Systems, Human Resources, Finance, Compliance & Risk.
- Job titles: Cash Custodian, Cash Processing Officer, Site Supervisor, Operations Manager, IT Support Technician, HR Officer, HR Manager, Finance Officer, Compliance Officer, Client Liaison Officer.

## 7. Leave register

### 7.1 Operating model
Employees continue to request leave using CIT's existing manual process. HR or authorised administration captures the information from the physical/manual leave form. The application is a digital leave register only; it does not accept employee applications or approve leave.

### 7.2 Leave categories and policy
Provide separate balances per category. Initial configurable categories:
- Annual Leave.
- Sick Leave.
- Family Responsibility Leave.
- Maternity Leave.
- Paternity/Parental Leave.
- Unpaid Leave.
- Study Leave (if applicable).
- Other Leave.

Authorised HR users configure entitlements and policy rules, including accrual, category eligibility, permanent/contract differences, carry-over, effective dates, and individual authorised adjustments. Do not hardcode statutory or company entitlement assumptions as CIT policy. Policy changes must not silently rewrite historical transactions or balances.

### 7.3 Leave transaction capture
Capture:
- Employee and employee number.
- Leave category.
- First and last day of leave.
- Date manual form was submitted.
- Date HR captured the transaction.
- Actual leave days deducted.
- Uploaded supporting leave form.
- Balance before, days deducted, and balance after.
- Capturing HR/administrative user.

Calculate leave days automatically using the employee's applicable working schedule, CIT policy, weekends, and South African public holidays. Show the calculation to the capturing user before saving. On save, deduct from the relevant category balance and preserve the transaction in chronological history. Corrections must use auditable adjustment, reversal, or void records; never erase the original transaction.

Provide individual and company leave reports, monthly/annual reporting, and per-category views showing entitlement, taken, and remaining balance.

### 7.4 Working calendar assumption requiring CIT confirmation
Default ordinary schedule is Monday–Friday; Saturdays, Sundays, and South African public holidays are excluded from ordinary leave-day calculations. Weekend overtime is tracked separately and does not automatically make a weekend a normal working day or change leave entitlement. Some employees may have different normal shift patterns. The implementation must support configurable working schedules where CIT policy requires them. CIT must confirm the rules for employees whose ordinary roster includes weekends before production use.

## 8. Weekend overtime register

Record formally confirmed weekend overtime without calculating pay:
- Employee and employee number.
- Posting site.
- Date worked.
- Start and finish times.
- Total hours.
- Authorising/confirming manager.
- Supporting documentation where applicable.
- Notes.

Preserve history. Provide reports by employee, posting site, and whole CIT, with filters for date range, employee, site, and manager. Weekend overtime does not automatically alter leave policy or working-day calculations.

## 9. Disciplinary records

Keep disciplinary records separate from recommendations. Support multiple hearing records per employee, each containing:
- Hearing date.
- Nature/description of matter.
- Outcome/finding.
- Recommendation or sanction.
- Supporting documents.

Treat this module and its attachments as sensitive information with restricted access and audit history.

## 10. Recommendations

Keep recommendations separate from disciplinary records. Support multiple entries per employee:
- Recommendation date.
- Type.
- Description.
- Person/manager making the recommendation.
- Supporting documents.
- Additional comments.

Examples include commendations, performance recommendations, promotion recommendations, and other management recommendations.

## 11. Audit and record integrity

Record who created and last changed relevant records and when. Preserve historical employment, posting, leave, overtime, disciplinary, and recommendation records. Important changes must be auditable. Use reversals or adjustments rather than destructive edits where a transaction has already affected a balance or formal history.

## 12. Reporting

At minimum:
- Employee directory and employee profile/history.
- Employee and organisation leave balances and leave transaction history.
- Monthly and annual leave reports.
- Weekend overtime reports by employee, site, and organisation.
- Employment/posting history.
- Disciplinary and recommendation records, subject to permissions.

## 13. Production-readiness conditions

Before real employee data is entered:
- Confirm CIT's leave policy, entitlements, accrual, carry-over, and working calendars.
- Verify the six seed site names, codes, addresses, and manager assignments.
- Confirm disciplinary access boundaries and retention rules.
- Establish secure hosting, private file storage, backups, recovery testing, and access controls.
- Configure individual accounts and strong authentication.
- Confirm applicable privacy and employment-record obligations.
- Do not use real employee records in development or public demos.