live deployed on render: https://employee-attendance-management-system-kq7t.onrender.com/
# Employee Attendance Management System

A complete full-stack attendance management system built for the MT-Developer assignment for Inner Eye Consultancy Services LLP.

## Features
- Employee registration and login
- Secure password hashing
- JWT-based authentication in an HttpOnly cookie
- Attendance check-in / check-out
- Working-hours calculation
- Leave deduction calculation
- HR dashboard
- Employee dashboard
- Attendance status tracking
- Role-based access control
- SQLite database with automatic schema creation
- Responsive UI

## Tech Stack
- Backend: Node.js + Express
- Database: SQLite via better-sqlite3
- Frontend: HTML/CSS/JavaScript
- Authentication: JWT + HttpOnly cookie
- Password security: bcrypt

## Run locally

1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and change `JWT_SECRET`.
5. Run:
   ```bash
   npm start
   ```
6. Open http://localhost:3000

The SQLite database is created automatically in `data/attendance.db`.

## Demo accounts
The app seeds these accounts on first run:
- HR: `hr@company.com` / `Admin@123`
- Employee: `employee@company.com` / `Employee@123`

Change demo passwords before production use.

## Leave deduction rule
For this assessment, leave deduction is calculated as:
- Available paid leave: 12 days per calendar year
- Deducted leave = approved leave days
- Unpaid leave = max(0, approved leave days - remaining paid leave)

The rule is intentionally isolated in `calculateLeaveDeduction()` so it can be changed easily to match a company's policy.

## Project structure
- `server.js` - Express API and database initialization
- `public/` - frontend application
- `database/schema.sql` - database schema reference
- `docs/API.md` - API documentation
- `docs/SETUP.md` - setup and deployment notes

## Registration troubleshooting

The registration form validates the name, email, and password in the browser and restores the button if the server returns an error. If an email is already registered, use a different email or sign in with that account.

For Node.js environments where `better-sqlite3` native binaries are unavailable, install a current supported version of Node.js and run `npm install` again.
