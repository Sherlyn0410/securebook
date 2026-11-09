-- SecureBook v1 baseline schema and demo data
-- WARNING: running this file drops and recreates the securebook database.

DROP DATABASE IF EXISTS securebook;
CREATE DATABASE securebook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE securebook;

CREATE TABLE users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  phone       VARCHAR(30),
  password    VARCHAR(255) NOT NULL,          -- v1 baseline: stored in plain text
  role        ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE services (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  description   VARCHAR(255),
  duration_min  INT NOT NULL DEFAULT 30
);

CREATE TABLE slots (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  service_id  INT NOT NULL,
  slot_date   DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id)
);

-- Booking IDs start at 1001 and increase by one, which makes them easy to guess
CREATE TABLE bookings (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  slot_id       INT NOT NULL,
  notes         TEXT,                          -- v1 baseline: no length limit
  status        ENUM('booked', 'cancelled') NOT NULL DEFAULT 'booked',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at  TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (slot_id) REFERENCES slots(id)
) AUTO_INCREMENT = 1001;

-- Demo accounts (plain text passwords in v1)
INSERT INTO users (name, email, phone, password, role) VALUES
  ('Clinic Admin', 'admin@securebook.test', '04-2345678',  'admin123', 'admin'),
  ('Alice Tan',    'alice@example.com',     '012-3456789', 'alice123', 'user'),
  ('Bob Lim',      'bob@example.com',       '016-9876543', 'bob123',   'user');

INSERT INTO services (name, description, duration_min) VALUES
  ('General Consultation', 'First visit or general health check',  30),
  ('Follow-up Visit',      'Review after a previous appointment',  15),
  ('Counselling Session',  'One-to-one session with a counsellor', 60);

-- Slots: one in the past (to show missing date checks) and several upcoming
INSERT INTO slots (service_id, slot_date, start_time, end_time) VALUES
  (1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '10:00', '10:30'),
  (1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:00', '09:30'),
  (1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:30', '10:00'),
  (2, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '14:00', '14:15'),
  (3, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '10:00', '11:00'),
  (1, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '15:00', '15:30'),
  (2, DATE_ADD(CURDATE(), INTERVAL 3 DAY), '11:00', '11:15'),
  (3, DATE_ADD(CURDATE(), INTERVAL 3 DAY), '16:00', '17:00'),
  (1, DATE_ADD(CURDATE(), INTERVAL 4 DAY), '09:00', '09:30'),
  (1, DATE_ADD(CURDATE(), INTERVAL 4 DAY), '09:30', '10:00');

-- Alice owns booking 1001, Bob owns booking 1002
INSERT INTO bookings (user_id, slot_id, notes) VALUES
  (2, 2, 'First visit, mild fever'),
  (3, 5, 'Prefer a female counsellor');
