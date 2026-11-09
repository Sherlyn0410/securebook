# SecureBook

Appointment booking website for our 6005CEM Security coursework (CW2).

Users can register, book a time slot, see their bookings and cancel them. The admin manages services, time slots, bookings and user accounts.

**Note:** this is the v1 baseline. It has security problems on purpose so we can test and document them before fixing them. Don't host this version online.

Built with Node.js (Express), EJS and MySQL.

## Setup

You need Node.js (LTS version) and MySQL 8 or MariaDB.

### macOS

1. Install Node.js LTS from https://nodejs.org
2. Install and start MySQL with Homebrew:
   ```bash
   brew install mysql@8.4
   brew services start mysql@8.4
   ```
3. Import the database (just press Enter at the password prompt if root has no password):
   ```bash
   cd securebook
   mysql -h 127.0.0.1 -u root -p < db/schema.sql
   ```
4. Start the app:
   ```bash
   cp .env.example .env
   npm install
   npm run dev
   ```

Using XAMPP on Mac instead? Start MySQL in XAMPP and use `/Applications/XAMPP/xamppfiles/bin/mysql` in step 3.

### Windows

1. Install Node.js LTS from https://nodejs.org
2. Install XAMPP from https://www.apachefriends.org, open the XAMPP Control Panel and start **MySQL**.
3. Import the database. Either:
   - **phpMyAdmin:** also start **Apache**, go to http://localhost/phpmyadmin, click **Import**, choose `db/schema.sql` and click **Import**, or
   - **Command Prompt** (not PowerShell, because `<` doesn't work there):
     ```bat
     cd path\to\securebook
     C:\xampp\mysql\bin\mysql.exe -u root < db\schema.sql
     ```
4. Start the app in Command Prompt:
   ```bat
   copy .env.example .env
   npm install
   npm run dev
   ```

If PowerShell says "running scripts is disabled on this system" when you run npm, just use Command Prompt.

If you installed MySQL with the MySQL Installer instead of XAMPP, the path in step 3 is usually `"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p`.

### After setup

Open http://localhost:3000

- If your MySQL root user has a password, put it in `.env` (`DB_PASSWORD=yourpassword`).
- To reset all the demo data, import `db/schema.sql` again. It drops and recreates the database.

## Demo accounts

| Role  | Email                 | Password | Booking |
|-------|-----------------------|----------|---------|
| Admin | admin@securebook.test | admin123 | -       |
| User  | alice@example.com     | alice123 | #1001   |
| User  | bob@example.com       | bob123   | #1002   |

## Folder structure

```
db/schema.sql            tables and demo data
src/app.js               express setup, sessions, error handler
src/db.js                mysql connection
src/middleware/auth.js   login check
src/routes/auth.js       register, login, logout, profile
src/routes/bookings.js   slots, booking, my bookings, cancel
src/routes/admin.js      admin dashboard, schedule, users
src/views/               ejs pages
public/css/style.css     styles
```

## Known issues in v1

These are what we test in Chapter 2 of the report. Each one is marked in the code with a `v1 baseline` comment.

| Report | Issue | How to test |
|---|---|---|
| 2.1.1.1 | Passwords saved in plain text | Look at the `users` table |
| 2.1.1.2 | No password rules | Register with password `1` |
| 2.1.1.3 | No login limit, error messages reveal which emails exist | Burp Intruder on POST /login |
| 2.1.2.1 | Session never expires, same session ID after login | DevTools > Application > Cookies |
| 2.1.2.2 | No CSRF token on forms | HTML page on another site that auto-submits a cancel request |
| 2.1.3.1 | Can view/cancel other people's bookings (IDOR) | Log in as Alice, open `/bookings/1002` |
| 2.1.3.2 | No admin role check | Log in as Alice, open `/admin` |
| 2.1.4.1 | No server-side input validation | Burp: book with `slot_id=1` (yesterday) or a very long note |
| 2.1.4.2 | SQL injection in the date filter | `/bookings?date=' OR '1'='1` |
| 2.1.4.3 | Stored XSS in booking notes | Book with `<script>alert('XSS')</script>` as the note, then open `/admin` |
| 2.1.5 | Error page shows the stack trace | Burp: book with `slot_id=999` |
| 2.1.6 | No limit on bookings, double booking possible | Burp Intruder on POST /bookings |
| 2.1.7 | No audit log | Failed logins are not recorded anywhere |
| 2.1.8.1 | Runs on plain HTTP | Wireshark on the loopback interface while logging in |
| 2.1.8.2 | Cookie missing HttpOnly/Secure/SameSite, `X-Powered-By` header shown | DevTools > Network |
| 2.1.9 | No privacy notice | Register page |

## Working on fixes

Make your own branch from `main`, then open a pull request when your part is done:

```bash
git checkout main
git pull
git checkout -b your-name-feature
```
