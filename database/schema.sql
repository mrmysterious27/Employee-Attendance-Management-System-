CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('employee', 'hr')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK(status IN ('present', 'late', 'absent', 'leave')),
  working_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, attendance_date)
);

CREATE TABLE leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_attendance_user_date ON attendance(user_id, attendance_date);
CREATE INDEX idx_leave_user ON leaves(user_id);
