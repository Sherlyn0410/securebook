const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// v1 baseline: only checks that the user is logged in, not that they are an
// admin. The admin links are hidden in the menu, but any user can open
// /admin directly (report 2.1.3.2).
router.use(requireLogin);

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

router.post('/bookings/:id/cancel', async (req, res) => {
  await pool.query(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?",
    [req.params.id]
  );
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

router.post('/services', async (req, res) => {
  const { name, description, duration_min } = req.body;
  await pool.query(
    'INSERT INTO services (name, description, duration_min) VALUES (?, ?, ?)',
    [name, description, duration_min]
  );
  req.session.flash = { type: 'success', text: 'Service added.' };
  res.redirect('/admin/slots');
});

router.post('/slots', async (req, res) => {
  const { service_id, slot_date, start_time, end_time } = req.body;
  await pool.query(
    'INSERT INTO slots (service_id, slot_date, start_time, end_time) VALUES (?, ?, ?, ?)',
    [service_id, slot_date, start_time, end_time]
  );
  req.session.flash = { type: 'success', text: 'Time slot added.' };
  res.redirect('/admin/slots');
});

router.post('/slots/:id/delete', async (req, res) => {
  try {
    await pool.query('DELETE FROM slots WHERE id = ?', [req.params.id]);
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

router.post('/users/:id/toggle', async (req, res) => {
  await pool.query('UPDATE users SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
  req.session.flash = { type: 'success', text: 'User status updated.' };
  res.redirect('/admin/users');
});

module.exports = router;
