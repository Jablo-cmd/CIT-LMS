# CIT-LMS Technical Architecture

**Status:** Proposed baseline; implementation stack to be confirmed before application code is added.

## 1. Delivery constraints

- No paid cloud subscriptions or infrastructure are required for initial development.
- Build and run locally first.
- Do not introduce a hosted database or file-storage dependency during the initial build.
- Use synthetic sample records only.
- Keep deployment decisions separate from local development so hosting can be selected later based on cost, privacy, backups, and operational needs.

## 2. Proposed application shape

A conventional web application with:
- Responsive browser-based user interface.
- Server-side application/API layer enforcing authentication and role permissions.
- Relational database for structured records and audit history.
- Private file storage for employee photos and documents.
- Automated tests for critical calculations and permission boundaries.

A practical candidate stack is TypeScript with Next.js for the application and PostgreSQL for the database. Local PostgreSQL can run on the development machine or through a local container. This is a proposal, not a final commitment; confirm the development environment and deployment constraints before scaffolding.

## 3. Data design principles

- Use stable internal IDs for relationships; employee number remains a unique CIT-assigned identifier.
- Preserve immutable original hire date.
- Model position appointments and posting assignments as dated history records.
- Attach mandatory appointment/transfer evidence to the relevant history event.
- Keep leave transactions immutable once posted; use adjustment/reversal entries.
- Store policy versions/effective dates so later policy changes do not rewrite prior calculations.
- Separate disciplinary records from recommendations.
- Record actor and timestamps for important create/update actions.
- Enforce permissions on the server, not only by hiding interface controls.

## 4. Security and privacy

- Private repository; no real personal data in Git.
- Never commit secrets, passwords, tokens, production database dumps, or uploaded employee files.
- Keep uploaded files outside publicly served static directories.
- Apply least-privilege access and sensitive-module restrictions.
- Validate file type and size; generate safe storage names; prevent path traversal.
- Use secure password hashing and session handling.
- Maintain audit events for sensitive access and important changes where appropriate.
- Define backup encryption, retention, restore testing, and incident procedures before production.

## 5. Local development

Initial development should be reproducible on a developer workstation. Provide documented setup commands, environment-variable examples without secrets, database migrations, and synthetic seed data. Local data should be disposable and clearly marked as test data.

## 6. Deployment gate

Do not connect real CIT employee data until CIT has approved the requirements and leave rules, and the selected deployment provides:
- Private application access.
- Secure database and document storage.
- HTTPS and secure authentication.
- Automated backups and tested restoration.
- Monitoring and a defined maintenance owner.
- Appropriate privacy, access, and retention controls.

Free hosting tiers may be evaluated later, but they must not be assumed suitable for sensitive HR data merely because they are free.