# API

All endpoints return JSON.

## Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Employee
- `GET /api/employee/dashboard`
- `GET /api/employee/attendance`
- `POST /api/attendance/check-in`
- `POST /api/attendance/check-out`
- `GET /api/employee/leaves`
- `POST /api/employee/leaves`

## HR
- `GET /api/hr/dashboard`
- `GET /api/hr/employees`
- `GET /api/hr/attendance`
- `GET /api/hr/leaves`
- `PATCH /api/hr/leaves/:id`
