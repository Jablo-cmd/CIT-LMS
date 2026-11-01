# CIT-LMS Technical Architecture

**Status:** Technology direction confirmed; detailed implementation decisions will be made during scaffolding.

## 1. Confirmed technology direction

- **Language:** TypeScript across frontend and backend.
- **Frontend:** Next.js.
- **Backend:** Node.js, implemented as a separate API service.
- **API style:** REST.
- **Database:** PostgreSQL, running locally during initial development.
- **Initial file storage:** Private local storage outside publicly served directories.
- **Styling:** Tailwind CSS is the proposed UI styling approach.

The frontend and backend will be separate applications in one repository. This keeps the user interface separate from business rules, data access, authentication, and permission enforcement.

## 2. Proposed repository structure

```
CIT-LMS/
├── apps/
│   ├── web/                 # Next.js + TypeScript frontend
│   └── api/                 # Node.js + TypeScript backend
├── docs/
│   ├── functional-specification.md
│   └── technical-architecture.md
├── .gitignore
└── README.md
```

The backend framework and database access library will be selected during scaffolding. A lightweight Express API and Prisma ORM are suitable defaults, subject to compatibility checks at implementation time.

## 3. Delivery constraints

- No paid cloud subscriptions or infrastructure are required for initial development.
- Build and run locally first.
- Do not introduce a hosted database or file-storage dependency during the initial build.
- Use synthetic sample records only.
- Keep deployment decisions separate from local development so hosting can be selected later based on cost, privacy, backups, and operational needs.

## 4. Application responsibilities

### Next.js frontend
- Responsive browser-based interface.
- Employee directory and profile screens.
- HR capture forms and reports.
- Role-aware navigation and user experience.
- Communicates with the backend through the REST API.

### Node.js backend
- Authentication and session management.
- Server-side role and permission enforcement.
- Business rules and validation.
- Employee, employment-history, posting, leave, overtime, disciplinary, and recommendation services.
- Leave-day calculation and balance transaction handling.
- Secure document upload and retrieval.
- Audit history and reporting endpoints.
- Database access and migrations.

The backend is the authority for permissions and business rules. Hiding a button in the frontend is never treated as access control.

## 5. Data design principles

- Use stable internal IDs for relationships; employee number remains a unique CIT-assigned identifier.
- Preserve immutable original hire date.
- Model position appointments and posting assignments as dated history records.
- Attach mandatory appointment/transfer evidence to the relevant history event.
- Keep leave transactions immutable once posted; use adjustment/reversal entries.
- Store policy versions/effective dates so later policy changes do not rewrite prior calculations.
- Separate disciplinary records from recommendations.
- Record actor and timestamps for important create/update actions.
- Enforce permissions on the server.

## 6. Security and privacy

- Private repository; no real personal data in Git.
- Never commit secrets, passwords, tokens, production database dumps, or uploaded employee files.
- Keep uploaded files outside publicly served static directories.
- Apply least-privilege access and sensitive-module restrictions.
- Validate file type and size; generate safe storage names; prevent path traversal.
- Use secure password hashing and session handling.
- Maintain audit events for sensitive access and important changes where appropriate.
- Define backup encryption, retention, restore testing, and incident procedures before production.

## 7. Local development

Initial development should be reproducible on a developer workstation. Provide documented setup commands, environment-variable examples without secrets, database migrations, and synthetic seed data. Local data should be disposable and clearly marked as test data.

## 8. Deployment gate

Do not connect real CIT employee data until CIT has approved the requirements and leave rules, and the selected deployment provides:
- Private application access.
- Secure database and document storage.
- HTTPS and secure authentication.
- Automated backups and tested restoration.
- Monitoring and a defined maintenance owner.
- Appropriate privacy, access, and retention controls.

Free hosting tiers may be evaluated later, but they must not be assumed suitable for sensitive HR data merely because they are free.