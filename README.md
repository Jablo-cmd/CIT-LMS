# CIT-LMS

**CIT Employee Management & Leave Records System**

CIT-LMS is an internal HR records application for employee profiles, employment and posting history, leave transactions, weekend overtime, disciplinary records, recommendations, and supporting documents.

## Project principles

- Local-first development with no paid cloud dependency during initial development.
- Role-based access for the Company Owner, HR Manager, and Administrative Personnel.
- Preserve historical records; important changes must be auditable.
- Protect personal, employment, disciplinary, and identity documents.
- Record leave captured from CIT's existing manual forms; this is not a leave application or approval workflow.
- No payroll, salary management, attendance tracking, employee self-service accounts, or overtime-pay calculations.

## Project status

Initial project documentation has been committed. Application implementation has not started; the functional scope and architecture are documented first.

## Documentation

- [Functional specification](docs/functional-specification.md)
- [Technical architecture](docs/technical-architecture.md)

## Security

This repository is private. Never commit real employee information, identity documents, credentials, database dumps, environment files, or production records. Use synthetic demo data only.

## Initial development approach

Develop and test locally first. Hosting, database deployment, backups, and operational security must be assessed before any real employee data is introduced.