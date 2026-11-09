const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// ---------- Available slots ----------

router.get('/slots', requireLogin, async (req, res) => {
  const date = req.query.date || '';
  const params = [];

  let sql = `
    SELECT s.id, s.slot_date, s.start_time, s.end_time,
           sv.name AS service_name, sv.duration_min
    FROM slots s
    JOIN services sv ON sv.id = s.service_id
    LEFT JOIN bookings b ON b.slot_id = s.id AND b.status = 'booked'
    WHERE b.id IS NULL AND s.slot_date >= CURDATE()`;

  if (date) {
    sql += ' AND s.slot_date = ?';
    params.push(date);
  }
  sql += ' ORDER BY s.slot_date, s.start_time';

  const [slots] = await pool.query(sql, params);
  res.render('slots', { title: 'Book an appointment', slots, date });
});

// ---------- Create a booking ----------

router.post('/bookings', requireLogin, async (req, res) => {
  const { slot_id, notes } = req.body;

  // v1 baseline: slot_id and notes are not validated, the slot is not checked
  // for date or availability, and there is no limit on how many bookings one
  // user or script can make (report 2.1.4.1, 2.1.6)
  await pool.query(
    'INSERT INTO bookings (user_id, slot_id, notes) VALUES (?, ?, ?)',
    [req.session.user.id, slot_id, notes]
  );

  req.session.flash = { type: 'success', text: 'Appointment booked.' };
  res.redirect('/bookings');
});

// ---------- My bookings ----------

router.get('/bookings', requireLogin, async (req, res) => {
  const date = req.query.date || '';

  // v1 baseline: the date filter is joined straight into the SQL string,
  // so ?date=' OR '1'='1 returns every booking in the system (report 2.1.4.2)
  let sql = `
    SELECT b.id, b.status, b.notes, s.slot_date, s.start_time,
           sv.name AS service_name, u.name AS contact_name, u.phone AS contact_phone
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    JOIN services sv ON sv.id = s.service_id
    JOIN users u ON u.id = b.user_id
    WHERE b.user_id = ${req.session.user.id}`;

  if (date) {
    sql += ` AND s.slot_date = '${date}'`;
  }
  sql += ' ORDER BY s.slot_date DESC, s.start_time DESC';

  const [bookings] = await pool.query(sql);
  res.render('bookings', { title: 'My bookings', bookings, date });
});

// ---------- View one booking ----------

router.get('/bookings/:id', requireLogin, async (req, res) => {
  // v1 baseline: the booking is loaded by ID only, with no check that it
  // belongs to the logged-in user (IDOR, report 2.1.3.1)
  const [rows] = await pool.query(
    `SELECT b.*, s.slot_date, s.start_time, s.end_time, sv.name AS service_name,
            u.name AS contact_name, u.email AS contact_email, u.phone AS contact_phone
     FROM bookings b
     JOIN slots s ON s.id = b.slot_id
     JOIN services sv ON sv.id = s.service_id
     JOIN users u ON u.id = b.user_id
     WHERE b.id = ?`,
    [req.params.id]
  );

  if (rows.length === 0) {
    return res.status(404).render('404', { title: 'Not found' });
  }
  res.render('booking', { title: `Booking #${rows[0].id}`, booking: rows[0] });
});

// ---------- Cancel a booking ----------

router.post('/bookings/:id/cancel', requireLogin, async (req, res) => {
  // v1 baseline: any logged-in user can cancel any booking by changing the
  // ID, and the form has no CSRF token (report 2.1.3.1, 2.1.2.2)
  await pool.query(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?",
    [req.params.id]
  );

  req.session.flash = { type: 'success', text: `Booking #${req.params.id} cancelled.` };
  res.redirect('/bookings');
});

module.exports = router;
