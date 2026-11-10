const express = require('express');
const pool = require('../db');
const { requireRole } = require('../middleware/auth');
const { rules, getErrors } = require('../validation');
const { logEvent } = require('../audit');

const router = express.Router();

// B: every /admin route requires the admin role, checked on the server
router.use(requireRole('admin'));

// ---------- Dashboard ----------

router.get('/', async (req, res) => {
  const [[stats]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM bookings WHERE status = 'booked')    AS active_bookings,
      (SELECT COUNT(*) FROM bookings WHERE status = 'cancelled') AS cancelled_bookings,
      (SELECT COUNT(*) FROM users WHERE role = 'user')           AS customers,
      (SELECT COUNT(*) FROM slots WHERE slot_date >= CURDATE())  AS upcoming_slots`);

  const [bookings] = await pool.query(`
    SELECT b.id, b.status, b.notes, s.slot_date, s.start_time,
           sv.name AS service_name, u.name AS customer_name, u.phone AS customer_phone
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    JOIN services sv ON sv.id = s.service_id
    JOIN users u ON u.id = b.user_id
    ORDER BY s.slot_date DESC, s.start_time DESC`);

  res.render('admin/dashboard', { title: 'Admin dashboard', stats, bookings });
});

router.post('/bookings/:id/cancel', rules.id, async (req, res) => {
  if (getErrors(req).length) return res.redirect('/admin');
  await pool.query(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = ? AND status = 'booked'",
    [req.params.id]
  );
  logEvent(req, 'ADMIN_CANCEL_BOOKING', `booking ${req.params.id}`);
  req.session.flash = { type: 'success', text: `Booking #${req.params.id} cancelled.` };
  res.redirect('/admin');
});

// ---------- Services and slots ----------

router.get('/slots', async (req, res) => {
  const [services] = await pool.query('SELECT * FROM services ORDER BY id');
  const [slots] = await pool.query(`
    SELECT s.id, s.slot_date, s.start_time, s.end_time, sv.name AS service_name,
           (SELECT COUNT(*) FROM bookings b WHERE b.slot_id = s.id AND b.status = 'booked') AS booked
    FROM slots s
    JOIN services sv ON sv.id = s.service_id
    ORDER BY s.slot_date DESC, s.start_time`);

  res.render('admin/slots', { title: 'Manage schedule', services, slots });
});

router.post('/services', rules.service, async (req, res) => {
  const errors = getErrors(req);   // C
  if (errors.length) {
    req.session.flash = { type: 'error', text: errors[0] };
    return res.redirect('/admin/slots');
  }
  const { name, description, duration_min } = req.body;
  await pool.query(
    'INSERT INTO services (name, description, duration_min) VALUES (?, ?, ?)',
    [name, description || null, duration_min]
  );
  logEvent(req, 'ADMIN_ADD_SERVICE', name);
  req.session.flash = { type: 'success', text: 'Service added.' };
  res.redirect('/admin/slots');
});

router.post('/slots', rules.slot, async (req, res) => {
  const errors = getErrors(req);   // C
  if (errors.length) {
    req.session.flash = { type: 'error', text: errors[0] };
    return res.redirect('/admin/slots');
  }
  const { service_id, slot_date, start_time, end_time } = req.body;
  await pool.query(
    'INSERT INTO slots (service_id, slot_date, start_time, end_time) VALUES (?, ?, ?, ?)',
    [service_id, slot_date, start_time, end_time]
  );
  logEvent(req, 'ADMIN_ADD_SLOT', `${slot_date} ${start_time}-${end_time}`);
  req.session.flash = { type: 'success', text: 'Time slot added.' };
  res.redirect('/admin/slots');
});

router.post('/slots/:id/delete', rules.id, async (req, res) => {
  if (getErrors(req).length) return res.redirect('/admin/slots');
  try {
    await pool.query('DELETE FROM slots WHERE id = ?', [req.params.id]);
    logEvent(req, 'ADMIN_DELETE_SLOT', `slot ${req.params.id}`);
    req.session.flash = { type: 'success', text: 'Time slot removed.' };
  } catch (err) {
    if (err.code !== 'ER_ROW_IS_REFERENCED_2') throw err;
    req.session.flash = { type: 'error', text: 'This slot has bookings and cannot be removed.' };
  }
  res.redirect('/admin/slots');
});

// ---------- Users ----------

router.get('/users', async (req, res) => {
  const [users] = await pool.query(
    'SELECT id, name, email, phone, role, is_active, created_at FROM users ORDER BY id'
  );
  res.render('admin/users', { title: 'Manage users', users });
});

router.post('/users/:id/toggle', rules.id, async (req, res) => {
  if (getErrors(req).length) return res.redirect('/admin/users');
  if (req.params.id === req.session.user.id) {
    req.session.flash = { type: 'error', text: 'You cannot deactivate your own account.' };
    return res.redirect('/admin/users');
  }
  await pool.query('UPDATE users SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
  logEvent(req, 'ADMIN_TOGGLE_USER', `user ${req.params.id}`);
  req.session.flash = { type: 'success', text: 'User status updated.' };
  res.redirect('/admin/users');
});

// ---------- D: security log and analytics ----------

const EVENT_TYPES = [
  'LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'LOGIN_BLOCKED_LOCKED', 'LOGIN_BLOCKED_INACTIVE', 'LOGOUT',
  'REGISTER', 'ACCESS_DENIED', 'CSRF_REJECTED', 'VALIDATION_FAILED',
  'RATE_LIMITED_LOGIN', 'RATE_LIMITED_BOOKING', 'RATE_LIMITED_REGISTER',
  'BOOKING_CREATED', 'BOOKING_CANCELLED', 'BOOKING_REJECTED',
  'ADMIN_CANCEL_BOOKING', 'ADMIN_ADD_SERVICE', 'ADMIN_ADD_SLOT', 'ADMIN_DELETE_SLOT', 'ADMIN_TOGGLE_USER'
];
const THREAT_EVENTS = ['LOGIN_FAILED', 'ACCOUNT_LOCKED', 'ACCESS_DENIED', 'CSRF_REJECTED',
  'RATE_LIMITED_LOGIN', 'RATE_LIMITED_BOOKING', 'RATE_LIMITED_REGISTER', 'VALIDATION_FAILED'];

router.get('/security', async (req, res) => {
  // Only event types from the allow-list can be used as a filter
  const type = EVENT_TYPES.includes(req.query.type) ? req.query.type : '';

  const [[summary]] = await pool.query(`
    SELECT
      SUM(event_type = 'LOGIN_FAILED')       AS failed_logins,
      SUM(event_type = 'ACCOUNT_LOCKED')     AS lockouts,
      SUM(event_type = 'ACCESS_DENIED')      AS access_denied,
      SUM(event_type = 'CSRF_REJECTED' OR event_type LIKE 'RATE_LIMITED%') AS blocked_requests
    FROM audit_logs WHERE created_at >= NOW() - INTERVAL 1 DAY`);

  const [daily] = await pool.query(`
    SELECT DATE(created_at) AS day, COUNT(*) AS total
    FROM audit_logs
    WHERE event_type IN (?) AND created_at >= CURDATE() - INTERVAL 6 DAY
    GROUP BY DATE(created_at)`, [THREAT_EVENTS]);

  // Fill in all 7 days, including days with no events
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    const found = daily.find((r) => String(r.day).slice(0, 10) === key);
    days.push({ day: key, total: found ? Number(found.total) : 0 });
  }

  const [topIps] = await pool.query(`
    SELECT ip_address, COUNT(*) AS total
    FROM audit_logs
    WHERE event_type IN (?) AND created_at >= NOW() - INTERVAL 1 DAY
    GROUP BY ip_address ORDER BY total DESC LIMIT 5`, [THREAT_EVENTS]);

  const [events] = await pool.query(`
    SELECT a.created_at, a.event_type, a.ip_address, a.details, u.email
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    ${type ? 'WHERE a.event_type = ?' : ''}
    ORDER BY a.id DESC LIMIT 100`, type ? [type] : []);

  res.render('admin/security', {
    title: 'Security log', summary, days, topIps, events, type, eventTypes: EVENT_TYPES, threatEvents: THREAT_EVENTS
  });
});

module.exports = router;
