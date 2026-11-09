const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// ---------- Registration ----------

router.get('/register', (req, res) => {
  res.render('register', { title: 'Register', error: null, form: {} });
});

router.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body;

  // v1 baseline: no server-side validation, no password policy and the
  // password is stored in plain text (report 2.1.1.1, 2.1.1.2).
  // A duplicate email crashes into the stack-trace error page.
  await pool.query(
    'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
    [name, email, phone, password]
  );

  req.session.flash = { type: 'success', text: 'Account created. Please log in.' };
  res.redirect('/login');
});

// ---------- Login / logout ----------

router.get('/login', (req, res) => {
  res.render('login', { title: 'Log in', error: null, email: '' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // v1 baseline: unlimited attempts, and the two different error messages
  // reveal which emails are registered (report 2.1.1.3)
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  if (rows.length === 0) {
    return res.status(401).render('login', { title: 'Log in', error: 'No account found with that email.', email });
  }

  const user = rows[0];
  if (user.password !== password) {
    return res.status(401).render('login', { title: 'Log in', error: 'Incorrect password.', email });
  }
  if (!user.is_active) {
    return res.status(403).render('login', { title: 'Log in', error: 'This account has been deactivated.', email });
  }

  // v1 baseline: the session ID is not regenerated after login (report 2.1.2.1)
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect(user.role === 'admin' ? '/admin' : '/bookings');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------- Profile ----------

router.get('/profile', requireLogin, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT name, email, phone FROM users WHERE id = ?',
    [req.session.user.id]
  );
  res.render('profile', { title: 'My profile', profile: rows[0] });
});

router.post('/profile', requireLogin, async (req, res) => {
  const { name, phone } = req.body;

  // v1 baseline: no CSRF token and no validation (report 2.1.2.2, 2.1.4.1)
  await pool.query(
    'UPDATE users SET name = ?, phone = ? WHERE id = ?',
    [name, phone, req.session.user.id]
  );
  req.session.user.name = name;

  req.session.flash = { type: 'success', text: 'Profile updated.' };
  res.redirect('/profile');
});

module.exports = router;
