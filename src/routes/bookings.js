const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');
const { bookingLimiter } = require('../middleware/rateLimits');
const { rules, getErrors } = require('../validation');
const { logEvent } = require('../audit');

const router = express.Router();

const MAX_ACTIVE_BOOKINGS = 3;   // B: stops one user hoarding the schedule

// ---------- Available slots ----------

router.get('/slots', requireLogin, rules.dateFilter, async (req, res) => {
  const errors = getErrors(req);
  const date = errors.length ? '' : (req.query.date || '');
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
  res.render('slots', { title: 'Book an appointment', slots, date, errors });
});

// ---------- Create a booking ----------

router.post('/bookings', requireLogin, bookingLimiter, rules.booking, async (req, res) => {
  const reject = (text, reason) => {
    logEvent(req, 'BOOKING_REJECTED', reason);
    req.session.flash = { type: 'error', text };
    res.redirect('/slots');
  };

  const errors = getErrors(req);   // C
  if (errors.length) {
    req.session.flash = { type: 'error', text: errors[0] };
    return res.redirect('/slots');
  }
  const { slot_id, notes } = req.body;
  const userId = req.session.user.id;

  // B: the slot must exist and be today or later
  const [slots] = await pool.query('SELECT id FROM slots WHERE id = ? AND slot_date >= CURDATE()', [slot_id]);
  if (!slots.length) return reject('This time slot is not available.', `slot ${slot_id} missing or in the past`);

  // B: limit on active upcoming bookings per user
  const [[{ active }]] = await pool.query(
    `SELECT COUNT(*) AS active FROM bookings b JOIN slots s ON s.id = b.slot_id
     WHERE b.user_id = ? AND b.status = 'booked' AND s.slot_date >= CURDATE()`,
    [userId]
  );
  if (active >= MAX_ACTIVE_BOOKINGS) {
    return reject(`You can have at most ${MAX_ACTIVE_BOOKINGS} upcoming bookings.`, `limit of ${MAX_ACTIVE_BOOKINGS} reached`);
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO bookings (user_id, slot_id, notes) VALUES (?, ?, ?)',
      [userId, slot_id, notes || null]
    );
    logEvent(req, 'BOOKING_CREATED', `booking ${result.insertId}, slot ${slot_id}`);
  } catch (err) {
    // B: the unique key on active_slot_id stops double booking, even for two requests at the same moment
    if (err.code === 'ER_DUP_ENTRY') return reject('Sorry, this slot has just been taken.', `slot ${slot_id} already booked`);
    throw err;
  }

  req.session.flash = { type: 'success', text: 'Appointment booked.' };
  res.redirect('/bookings');
});

// ---------- My bookings ----------

router.get('/bookings', requireLogin, rules.dateFilter, async (req, res) => {
  const errors = getErrors(req);
  const date = errors.length ? '' : (req.query.date || '');

  // C: parameterised query, the date is sent separately from the SQL
  const params = [req.session.user.id];
  let sql = `
    SELECT b.id, b.status, b.notes, s.slot_date, s.start_time,
           sv.name AS service_name, u.name AS contact_name, u.phone AS contact_phone
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    JOIN services sv ON sv.id = s.service_id
    JOIN users u ON u.id = b.user_id
    WHERE b.user_id = ?`;
  if (date) {
    sql += ' AND s.slot_date = ?';
    params.push(date);
  }
  sql += ' ORDER BY s.slot_date DESC, s.start_time DESC';

  const [bookings] = await pool.query(sql, params);
  res.render('bookings', { title: 'My bookings', bookings, date, errors });
});

// ---------- View one booking ----------

router.get('/bookings/:id', requireLogin, rules.bookingId, async (req, res) => {
  if (getErrors(req).length) return res.status(404).render('404', { title: 'Not found' });

  // B: the booking must belong to the logged-in user
  const [rows] = await pool.query(
    `SELECT b.*, s.slot_date, s.start_time, s.end_time, sv.name AS service_name,
            u.name AS contact_name, u.email AS contact_email, u.phone AS contact_phone
     FROM bookings b
     JOIN slots s ON s.id = b.slot_id
     JOIN services sv ON sv.id = s.service_id
     JOIN users u ON u.id = b.user_id
     WHERE b.id = ? AND b.user_id = ?`,
    [req.params.id, req.session.user.id]
  );

  if (rows.length === 0) {
    logEvent(req, 'ACCESS_DENIED', `view booking ${req.params.id}`);
    return res.status(404).render('404', { title: 'Not found' });   // 404, so others' booking IDs are not confirmed
  }
  res.render('booking', { title: `Booking #${rows[0].id}`, booking: rows[0] });
});

// ---------- Cancel a booking ----------

router.post('/bookings/:id/cancel', requireLogin, rules.bookingId, async (req, res) => {
  if (getErrors(req).length) return res.status(404).render('404', { title: 'Not found' });

  // B: only the owner can cancel, and only an active booking
  const [result] = await pool.query(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = ? AND user_id = ? AND status = 'booked'",
    [req.params.id, req.session.user.id]
  );

  if (result.affectedRows === 0) {
    logEvent(req, 'ACCESS_DENIED', `cancel booking ${req.params.id}`);
    return res.status(404).render('404', { title: 'Not found' });
  }

  logEvent(req, 'BOOKING_CANCELLED', `booking ${req.params.id}`);
  req.session.flash = { type: 'success', text: `Booking #${req.params.id} cancelled.` };
  res.redirect('/bookings');
});

module.exports = router;