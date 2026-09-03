const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "attendance.db"));
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('employee', 'hr')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'present' CHECK(status IN ('present', 'late', 'absent', 'leave')),
  working_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, attendance_date)
);
CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_leave_user ON leaves(user_id);
`);

function seedUser(name, email, password, role) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (!existing) {
    const hash = bcrypt.hashSync(password, 12);
    db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
      .run(name, email, hash, role);
  }
}
seedUser("HR Administrator", "hr@company.com", "Admin@123", "hr");
seedUser("Demo Employee", "employee@company.com", "Employee@123", "employee");

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
}

function auth(req, res, next) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: "Authentication required." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie("session");
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: "Access denied." });
    next();
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function minutesBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

function calculateLeaveDeduction(userId, year = new Date().getFullYear()) {
  const used = db.prepare(`
    SELECT COALESCE(SUM(days),0) AS used
    FROM leaves
    WHERE user_id = ? AND status = 'approved'
      AND strftime('%Y', start_date) = ?
  `).get(userId, String(year)).used;
  const allowance = 12;
  return {
    allowance,
    used: Number(used),
    remaining: Math.max(0, allowance - Number(used)),
    unpaid: Math.max(0, Number(used) - allowance)
  };
}

// Auth
app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Name, email and password are required." });
  }
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  const normalized = email.trim().toLowerCase();
  try {
    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare(
      "INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'employee')"
    ).run(name.trim(), normalized, hash);
    const user = db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(result.lastInsertRowid);
    res.cookie("session", signToken(user), { httpOnly: true, sameSite: "lax", maxAge: 8*60*60*1000 });
    res.status(201).json({ user });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Email is already registered." });
    res.status(500).json({ error: "Could not register account." });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email=?").get((email || "").trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const safe = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.cookie("session", signToken(safe), { httpOnly: true, sameSite: "lax", maxAge: 8*60*60*1000 });
  res.json({ user: safe });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/auth/me", auth, (req, res) => {
  const user = db.prepare("SELECT id,name,email,role,created_at FROM users WHERE id=?").get(req.user.id);
  if (!user) return res.status(401).json({ error: "User not found." });
  res.json({ user });
});

// Employee
app.get("/api/employee/dashboard", auth, requireRole("employee"), (req, res) => {
  const userId = req.user.id;
  const record = db.prepare("SELECT * FROM attendance WHERE user_id=? AND attendance_date=?").get(userId, today());
  const month = today().slice(0,7);
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS days,
      COALESCE(SUM(working_minutes),0) AS minutes,
      SUM(CASE WHEN status='present' OR status='late' THEN 1 ELSE 0 END) AS present_days
    FROM attendance
    WHERE user_id=? AND substr(attendance_date,1,7)=?
  `).get(userId, month);
  res.json({ today: record || null, month: stats, leave: calculateLeaveDeduction(userId) });
});

app.get("/api/employee/attendance", auth, requireRole("employee"), (req, res) => {
  const rows = db.prepare(`
    SELECT attendance_date, check_in, check_out, status, working_minutes
    FROM attendance WHERE user_id=? ORDER BY attendance_date DESC LIMIT 100
  `).all(req.user.id);
  res.json({ attendance: rows });
});

app.post("/api/attendance/check-in", auth, requireRole("employee"), (req, res) => {
  const d = today();
  const existing = db.prepare("SELECT * FROM attendance WHERE user_id=? AND attendance_date=?").get(req.user.id, d);
  if (existing?.check_in) return res.status(409).json({ error: "You have already checked in today." });
  const now = new Date().toISOString();
  if (existing) {
    db.prepare("UPDATE attendance SET check_in=?, status='present' WHERE id=?").run(now, existing.id);
  } else {
    db.prepare("INSERT INTO attendance (user_id,attendance_date,check_in,status) VALUES (?,?,?,'present')")
      .run(req.user.id, d, now);
  }
  res.json({ message: "Check-in recorded.", check_in: now });
});

app.post("/api/attendance/check-out", auth, requireRole("employee"), (req, res) => {
  const d = today();
  const record = db.prepare("SELECT * FROM attendance WHERE user_id=? AND attendance_date=?").get(req.user.id, d);
  if (!record?.check_in) return res.status(400).json({ error: "Please check in before checking out." });
  if (record.check_out) return res.status(409).json({ error: "You have already checked out today." });
  const now = new Date().toISOString();
  const mins = minutesBetween(record.check_in, now);
  db.prepare("UPDATE attendance SET check_out=?, working_minutes=? WHERE id=?").run(now, mins, record.id);
  res.json({ message: "Check-out recorded.", check_out: now, working_minutes: mins });
});

app.get("/api/employee/leaves", auth, requireRole("employee"), (req, res) => {
  const leaves = db.prepare(`
    SELECT id,start_date,end_date,days,reason,status,created_at
    FROM leaves WHERE user_id=? ORDER BY created_at DESC
  `).all(req.user.id);
  res.json({ leaves, summary: calculateLeaveDeduction(req.user.id) });
});

app.post("/api/employee/leaves", auth, requireRole("employee"), (req, res) => {
  const { start_date, end_date, reason } = req.body || {};
  if (!start_date || !end_date || end_date < start_date) {
    return res.status(400).json({ error: "Valid start and end dates are required." });
  }
  const start = new Date(start_date + "T00:00:00");
  const end = new Date(end_date + "T00:00:00");
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days > 31) return res.status(400).json({ error: "A single leave request cannot exceed 31 days." });
  const result = db.prepare(
    "INSERT INTO leaves (user_id,start_date,end_date,days,reason) VALUES (?,?,?,?,?)"
  ).run(req.user.id, start_date, end_date, days, (reason || "").trim());
  res.status(201).json({ id: result.lastInsertRowid, message: "Leave request submitted." });
});

// HR
app.get("/api/hr/dashboard", auth, requireRole("hr"), (req, res) => {
  const d = today();
  const employees = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='employee'").get().n;
  const present = db.prepare(`
    SELECT COUNT(*) AS n FROM attendance a JOIN users u ON u.id=a.user_id
    WHERE u.role='employee' AND attendance_date=? AND (status='present' OR status='late')
  `).get(d).n;
  const onLeave = db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS n FROM leaves
    WHERE status='approved' AND start_date<=? AND end_date>=?
  `).get(d,d).n;
  const pending = db.prepare("SELECT COUNT(*) AS n FROM leaves WHERE status='pending'").get().n;
  res.json({ employees, present, onLeave, pending, absent: Math.max(0, employees-present-onLeave) });
});

app.get("/api/hr/employees", auth, requireRole("hr"), (req, res) => {
  const employees = db.prepare(`
    SELECT id,name,email,created_at FROM users WHERE role='employee' ORDER BY name
  `).all();
  res.json({ employees });
});

app.get("/api/hr/attendance", auth, requireRole("hr"), (req, res) => {
  const date = req.query.date || today();
  const rows = db.prepare(`
    SELECT u.name,u.email,a.attendance_date,a.check_in,a.check_out,a.status,a.working_minutes
    FROM users u LEFT JOIN attendance a
      ON a.user_id=u.id AND a.attendance_date=?
    WHERE u.role='employee' ORDER BY u.name
  `).all(date);
  res.json({ date, attendance: rows });
});

app.get("/api/hr/leaves", auth, requireRole("hr"), (req, res) => {
  const leaves = db.prepare(`
    SELECT l.id,u.name,u.email,l.start_date,l.end_date,l.days,l.reason,l.status,l.created_at
    FROM leaves l JOIN users u ON u.id=l.user_id
    ORDER BY CASE l.status WHEN 'pending' THEN 0 ELSE 1 END, l.created_at DESC
  `).all();
  res.json({ leaves });
});

app.patch("/api/hr/leaves/:id", auth, requireRole("hr"), (req, res) => {
  const { status } = req.body || {};
  if (!["approved","rejected"].includes(status)) return res.status(400).json({ error: "Status must be approved or rejected." });
  const leave = db.prepare("SELECT * FROM leaves WHERE id=?").get(req.params.id);
  if (!leave) return res.status(404).json({ error: "Leave request not found." });
  db.prepare("UPDATE leaves SET status=? WHERE id=?").run(status, leave.id);
  res.json({ message: `Leave ${status}.` });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Employee Attendance Management System running at http://localhost:${PORT}`);
});
