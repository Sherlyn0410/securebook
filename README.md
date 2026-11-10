# SecureBook

Secure appointment booking website for our 6005CEM Security coursework (CW2).

Users can register, book a time slot, see their bookings and cancel them. The admin manages services, time slots, bookings and user accounts, and views a security dashboard.

This is the **secured version**. The original (vulnerable) baseline is kept in the Git history; the report compares the two. The app runs over HTTPS and applies authentication, access control, CSRF protection, input validation, rate limiting, audit logging and a PDPA privacy notice.

Built with Node.js (Express), EJS and MySQL.

## Requirements

Install these first if you don't already have them:

- **Node.js** (LTS version) — download from https://nodejs.org
- **XAMPP** — gives you MySQL and phpMyAdmin in one installer — https://www.apachefriends.org (or install MySQL 8 / MariaDB directly)
- **mkcert** — to create a locally trusted TLS certificate for HTTPS — https://github.com/FiloSottile/mkcert
  - macOS: `brew install mkcert nss`
  - Windows: `choco install mkcert` (or download it from the mkcert releases page)

Check Node is installed with `node -v` and `npm -v`.

## Setup

### 1. Get the code and install packages

```bash
git clone <repo link>
cd securebook
npm install
```

### 2. Create the database

Start MySQL (in XAMPP, start **MySQL**), then import the schema. It drops and recreates the `securebook` database with the tables and demo data.

- **phpMyAdmin:** start **Apache** too, open http://localhost/phpmyadmin, click **Import**, choose `db/schema.sql`, then **Go**.
- **Terminal (macOS):**
  ```bash
  mysql -h 127.0.0.1 -u root < db/schema.sql
  ```
- **Command Prompt (Windows, not PowerShell):**
  ```bat
  C:\xampp\mysql\bin\mysql.exe -u root < db\schema.sql
  ```

(If your MySQL root user has a password, add `-p` and type it when asked.)

### 3. Create the TLS certificate (required for HTTPS)

The server only runs over HTTPS, so it needs a certificate in a `certs/` folder. Create a locally trusted one with mkcert:

```bash
mkcert -install
mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1
```

This gives a green padlock in the browser. (No mkcert? You can make a self-signed one with `openssl`, but the browser will show a "Not secure" warning you have to click through.)

### 4. Create the `.env` file

```bash
cp .env.example .env          # Windows: copy .env.example .env
```

Then edit `.env`:
- Set a `SESSION_SECRET` (at least 32 characters). Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Database login: the default uses the least-privilege `securebook_app` account. Create it by running `db/create-app-user.sql` in phpMyAdmin (and put its password in `.env`). For a quick start you can instead set `DB_USER=root` and leave `DB_PASSWORD` as your root password.

### 5. Run the app

```bash
npm run dev     # auto-restarts on changes, or: npm start
```

Open **https://localhost:3443** — plain `http://localhost:3000` just redirects to HTTPS.

To reset the demo data, import `db/schema.sql` again.

## Demo accounts

| Role  | Email                 | Password        | Booking |
|-------|-----------------------|-----------------|---------|
| Admin | admin@securebook.test | Admin@Book2026! | -       |
| User  | alice@example.com     | Alice@Book2026! | #1001   |
| User  | bob@example.com       | Bob@Booking2026 | #1002   |

## Security features

Each area maps to a section of the report (Chapter 3).

| Area | What the app does | Report |
|---|---|---|
| Passwords | bcrypt hashing (cost 12), 15-character minimum, common passwords blocked | 3.1 |
| Login | rate limiting and account lockout after 5 failed attempts; one generic error message | 3.1 |
| Sessions | new session ID at login, 15-minute idle timeout, secure cookie | 3.1 / 3.4 |
| Access control | server-side RBAC on admin routes; every booking scoped to its owner (404 on mismatch) | 3.2 |
| CSRF | synchroniser token on every form | 3.2 |
| Abuse | request rate limits, max 3 active bookings per user, database prevents double-booking | 3.2 |
| Input & injection | server-side validation, parameterised queries, output encoding | 3.3 |
| Errors | central handler, friendly page with a reference code (no stack traces) | 3.3 |
| Transport | HTTPS (TLS 1.2+), HTTP-to-HTTPS redirect, HSTS | 3.4 |
| Headers & cookies | Helmet (CSP), HttpOnly/Secure/SameSite cookies, `X-Powered-By` removed | 3.4 |
| Logging | audit log and an admin-only security dashboard | 3.4 |
| Data protection | PDPA privacy notice with consent, least-privilege database account | 3.4 |

## Folder structure

```
db/schema.sql               tables and demo data
db/create-app-user.sql      least-privilege database account
certs/                      TLS certificate (not in Git, created with mkcert)
.env                        secrets and config (not in Git)
src/app.js                  express setup, HTTPS, Helmet, sessions, error handler
src/db.js                   mysql connection
src/audit.js                security event logging (logEvent)
src/passwordPolicy.js       password rules (NIST 15-char minimum)
src/validation.js           server-side input validation rules
src/middleware/auth.js      requireLogin and requireRole (RBAC)
src/middleware/csrf.js      CSRF synchroniser token
src/middleware/rateLimits.js  login, booking and register rate limits
src/routes/auth.js          register, login, logout, profile
src/routes/bookings.js      slots, booking, my bookings, cancel
src/routes/admin.js         admin dashboard, schedule, users, security log
src/routes/pages.js         privacy notice and security tips pages
src/views/                  ejs pages
public/css/style.css        styles
```

## Working on fixes

Each member works on their own branch off `main`, then opens a pull request:

```bash
git checkout main
git pull
git checkout -b your-name-feature
```

Note: `certs/` and `.env` are not committed, so each person creates their own (steps 3 and 4 above).
