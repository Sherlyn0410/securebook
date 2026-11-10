-- SecureBook v2 (secured) schema and demo data
-- WARNING: running this file drops and recreates the securebook database.

DROP DATABASE IF EXISTS securebook;
CREATE DATABASE securebook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE securebook;

CREATE TABLE users (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(100) NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,
  phone               VARCHAR(30),
  password_hash       VARCHAR(255) NOT NULL,              -- A: bcrypt hash, never plain text
  role                ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  failed_attempts     INT NOT NULL DEFAULT 0,             -- A: account lockout
  locked_until        DATETIME NULL,                      -- A: account lockout
  privacy_consent_at  DATETIME NULL,                      -- D: PDPA consent
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE bookings (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  slot_id         INT NOT NULL,
  notes           VARCHAR(500),                           -- C: length limited
  status          ENUM('booked', 'cancelled') NOT NULL DEFAULT 'booked',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at    TIMESTAMP NULL,
  -- B: only one active booking per slot (cancelled bookings become NULL and are ignored)
  active_slot_id  INT GENERATED ALWAYS AS (CASE WHEN status = 'booked' THEN slot_id ELSE NULL END) STORED,
  UNIQUE KEY uq_active_slot (active_slot_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (slot_id) REFERENCES slots(id)
) AUTO_INCREMENT = 1001;

-- D: security audit log (never stores passwords or tokens)
CREATE TABLE audit_logs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type  VARCHAR(40) NOT NULL,
  user_id     INT NULL,
  ip_address  VARCHAR(45),
  user_agent  VARCHAR(255),
  details     VARCHAR(500),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_time (created_at),
  INDEX idx_audit_type (event_type)
);

-- Demo accounts (passwords: Admin@Book2026!, Alice@Book2026!, Bob@Booking2026)
INSERT INTO users (name, email, phone, password_hash, role, privacy_consent_at) VALUES
  ('Clinic Admin', 'admin@securebook.test', '04-2345678',
   '$2b$12$Q97B1SWGg9Y3yeNKzPGmD.ObEw1LIeoKwPOnMQkd.j2GbFEfoqAMq', 'admin', NOW()),
  ('Alice Tan', 'alice@example.com', '012-3456789',
   '$2b$12$Xy4BWc.eZYVGIa2cVIDROeNi1sd4vshacswoEriBHGyBqHHrXiOk.', 'user', NOW()),
  ('Bob Lim', 'bob@example.com', '016-9876543',
   '$2b$12$r6mLJkD1ePaJ36j1zaUrWOqGgn3Zk2VwybBsPy2SBNn52Skw2YML2', 'user', NOW());

INSERT INTO services (name, description, duration_min) VALUES
  ('General Consultation', 'First visit or general health check',  30),
  ('Follow-up Visit',      'Review after a previous appointment',  15),
  ('Counselling Session',  'One-to-one session with a counsellor', 60);

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

INSERT INTO bookings (user_id, slot_id, notes) VALUES
  (2, 2, 'First visit, mild fever'),
  (3, 5, 'Prefer a female counsellor');
