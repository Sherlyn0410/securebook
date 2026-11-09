# SecureBook – Appointment Booking System (v1 baseline)

6005CEM / 6000CMD Security – CW2 group project.

This is the **v1 baseline**: a working booking website with **deliberate security flaws**.
The group uses it to capture the "before" evidence for Chapter 2 of the report, then each
member fixes their own issues for Chapter 3. **Do not deploy v1 on a public server.**

## Tech stack

- Node.js + Express 5 (server)
- EJS templates (pages)
- MySQL 8 or MariaDB (database)

## Setup on macOS

### 1. Install Node.js

Download the **LTS** installer from https://nodejs.org and run it. Check in Terminal:

```bash
node -v
npm -v
```

### 2. Get a MySQL database running (pick one)

**Option A – Homebrew**

```bash
brew install mysql
brew services start mysql
```

The user is `root` with no password by default.

**Option B – XAMPP**

Start **MySQL** in the XAMPP control panel. The user is `root` with no password.
You can import the schema in phpMyAdmin instead of step 3.

### 3. Create the database and demo data

```bash
cd securebook
mysql -u root -p < db/schema.sql      # press Enter if there is no password
```

> Running `schema.sql` again **drops and recreates** the database. Use it to reset the demo data.

### 4. Configure and run

```bash
cp .env.example .env     # then edit DB_PASSWORD if you set one
npm install
npm run dev              # restarts automatically when you save a file
```

Open http://localhost:3000

## Demo accounts

| Role  | Email                  | Password  | Owns booking |
|-------|------------------------|-----------|--------------|
| Admin | admin@securebook.test  | admin123  | –            |
| User  | alice@example.com      | alice123  | #1001        |
| User  | bob@example.com        | bob123    | #1002        |

## Project structure

```
db/schema.sql              tables + demo data
src/app.js                 Express setup, session, error handler
src/db.js                  MySQL connection pool
src/middleware/auth.js     login check
src/routes/auth.js         register, login, logout, profile
src/routes/bookings.js     slots, book, my bookings, view, cancel
src/routes/admin.js        dashboard, schedule, users
src/views/                 EJS pages
public/css/style.css       styling
```

## Known v1 vulnerabilities (for the report)

Each flaw is marked in the code with a `v1 baseline` comment.

| Report | Flaw | Where | How to show it |
|---|---|---|---|
| 2.1.1.1 | Plain text passwords | `routes/auth.js` register | Open the `users` table in phpMyAdmin / MySQL Workbench |
| 2.1.1.2 | No password policy | `routes/auth.js` register | Register with password `1` |
| 2.1.1.3 | No login rate limit + user enumeration | `routes/auth.js` login | Burp Intruder on POST /login; compare "No account found" vs "Incorrect password" |
| 2.1.2.1 | No session timeout / no ID regeneration | `app.js`, login | DevTools → Application → Cookies: `connect.sid` is the same before and after login |
| 2.1.2.2 | No CSRF token | all POST forms | External HTML page that auto-submits `POST /bookings/1002/cancel` |
| 2.1.3.1 | IDOR on bookings | `routes/bookings.js` | Log in as Alice, open `/bookings/1002` or cancel it in Burp Repeater |
| 2.1.3.2 | No role check on admin | `middleware/auth.js`, `routes/admin.js` | Log in as Alice, open `/admin` |
| 2.1.4.1 | No input validation | `POST /bookings` | Burp: change `slot_id` to `1` (yesterday's slot) and send a 5,000-character note |
| 2.1.4.2 | SQL injection | `GET /bookings?date=` | `/bookings?date=' OR '1'='1` shows every customer's bookings |
| 2.1.4.3 | Stored XSS | booking notes | Book with note `<script>alert('XSS')</script>`, then open `/admin` |
| 2.1.5 | Stack trace on errors | `app.js` error handler | Burp: book with `slot_id=999` |
| 2.1.6 | Booking abuse | `POST /bookings` | Burp Intruder books every slot in seconds |
| 2.1.7 | No audit logging | whole app | Nothing is recorded after failed logins |
| 2.1.8.1 | Plain HTTP | whole app | Wireshark on the loopback interface (lo0) shows the login form in clear text |
| 2.1.8.2 | Insecure cookie + headers | `app.js` | DevTools: cookie has no HttpOnly/Secure/SameSite; header `X-Powered-By: Express` |
| 2.1.9 | No privacy notice | register page | Screenshot of the register page |

## Suggested Git workflow

```bash
git init
git add .
git commit -m "v1 baseline"
git tag v1-baseline
```

Push to a shared GitHub repo. Each member then works on their own branch,
e.g. `git checkout -b memberA-authentication`, and merges back through a pull request.
The commit history shows each member's individual contribution for the viva.
