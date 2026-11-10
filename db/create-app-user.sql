-- D: least-privilege database account for the app.
-- It can read and change data but cannot drop tables, change the schema or create users.
-- Change the password, then put the same password in .env (DB_PASSWORD).
CREATE USER IF NOT EXISTS 'securebook_app'@'localhost' IDENTIFIED BY 'change-this-password';
CREATE USER IF NOT EXISTS 'securebook_app'@'127.0.0.1' IDENTIFIED BY 'change-this-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON securebook.* TO 'securebook_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON securebook.* TO 'securebook_app'@'127.0.0.1';
FLUSH PRIVILEGES;
