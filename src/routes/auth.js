const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimits');
const { checkPassword } = require('../passwordPolicy');
const { rules, getErrors } = require('../validation');
const { logEvent } = require('../audit');

const router = express.Router();

const BCRYPT_COST = 12;          // A: about 250 ms per hash, slow for attackers
const MAX_FAILED_LOGINS = 5;     // A: lock after 5 wrong passwords
const LOCK_MINUTES = 15;
// A: compared when the email does not exist, so both cases take the same time
const DUMMY_HASH = '$2b$12$Q97B1SWGg9Y3yeNKzPGmD.ObEw1LIeoKwPOnMQkd.j2GbFEfoqAMq';
const LOGIN_ERROR = 'Invalid email or password.';

// ---------- Registration ----------

router.get('/register', (req, res) => {
  res.render('register', { title: 'Register', errors: [], form: {} });
});

router.post('/register', registerLimiter, rules.register, async (req, res) => {
  const { name, email, phone, password, consent } = req.body;
  const form = { name, email, phone };

  const errors = getErrors(req);                                  // C
  const passwordError = checkPassword(password || '', email);     // A
  if (passwordError) errors.push(passwordError);
  if (consent !== 'yes') errors.push('Please agree to the privacy notice to continue.');   // D
  if (errors.length) {
    return res.status(400).render('register', { title: 'Register', errors, form });
  }

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) {
    return res.status(400).render('register', { title: 'Register', errors: ['This email is already registered.'], form });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);  // A
  const [result] = await pool.query(
    'INSERT INTO users (name, email, phone, password_hash, privacy_consent_at) VALUES (?, ?, ?, ?, NOW())',
    [name, email, phone || null, passwordHash]
  );
  logEvent(req, 'REGISTER', email, result.insertId);

  req.session.flash = { type: 'success', text: 'Account created. Please log in.' };
  res.redirect('/login');
});

// ---------- Login / logout ----------

router.get('/login', (req, res) => {
  res.render('login', { title: 'Log in', error: null, email: '' });
});

router.post('/login', loginLimiter, rules.login, async (req, res) => {
  const { email, password } = req.body;
  const fail = (message = LOGIN_ERROR, status = 401) =>
    res.status(status).render('login', { title: 'Log in', error: message, email });

  if (getErrors(req).length) return fail();

  const [rows] = await pool.query(
    'SELECT *, (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked FROM users WHERE email = ?',
    [email]
  );
  const user = rows[0];

  // A: locked accounts cannot log in, even with the right password
  if (user && user.is_locked) {
    logEvent(req, 'LOGIN_BLOCKED_LOCKED', email, user.id);
    return fail(`Too many failed attempts. Please try again in ${LOCK_MINUTES} minutes.`, 429);
  }

  const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !passwordOk) {
    if (user) {
      const attempts = user.failed_attempts + 1;
      if (attempts >= MAX_FAILED_LOGINS) {
        await pool.query(
          'UPDATE users SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
          [LOCK_MINUTES, user.id]
        );
        logEvent(req, 'ACCOUNT_LOCKED', email, user.id);
      } else {
        await pool.query('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, user.id]);
      }
    }
    logEvent(req, 'LOGIN_FAILED', email, user ? user.id : null);
    return fail();   // A: same message whether the email exists or not
  }

  if (!user.is_active) {
    logEvent(req, 'LOGIN_BLOCKED_INACTIVE', email, user.id);
    return fail('This account has been deactivated. Please contact the clinic.', 403);
  }

  await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);

  // A: new session ID after login (prevents session fixation)
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { title: 'Something went wrong', ref: 'session' });
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    logEvent(req, 'LOGIN_SUCCESS', email, user.id);
    req.session.save(() => res.redirect(user.role === 'admin' ? '/admin' : '/bookings'));
  });
});

router.post('/logout', (req, res) => {
  logEvent(req, 'LOGOUT');
  req.session.destroy(() => {
    res.clearCookie('sb.sid');
    res.redirect('/login');
  });
});

// ---------- Profile ----------

router.get('/profile', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT name, email, phone FROM users WHERE id = ?', [req.session.user.id]);
  res.render('profile', { title: 'My profile', profile: rows[0], errors: [] });
});

router.post('/profile', requireLogin, rules.profile, async (req, res) => {
  const { name, phone_prefix, phone_number } = req.body;
  const phone = phone_number ? `${phone_prefix}-${phone_number}` : '';

  const errors = getErrors(req);   // C
  if (errors.length) {
    const profile = { name, email: req.session.user.email, phone };
    return res.status(400).render('profile', { title: 'My profile', profile, errors });
  }

  await pool.query('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name, phone, req.session.user.id]);
  req.session.user.name = name;
  req.session.flash = { type: 'success', text: 'Profile updated.' };
  res.redirect('/profile');
});

module.exports = router;
