require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const pool = require('./db');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// v1 baseline: fallback secret in code, cookie readable by JavaScript,
// no idle timeout and sent over plain HTTP (report 2.1.2.1, 2.1.8.2).
// Express also sends "X-Powered-By: Express" by default.
app.use(session({
  secret: process.env.SESSION_SECRET || 'securebook-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: false }
}));

// Make the logged-in user and one-time flash message available to every view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.get('/', async (req, res) => {
  const [services] = await pool.query('SELECT * FROM services ORDER BY id');
  res.render('index', { title: 'Home', services });
});

app.use(authRoutes);
app.use(bookingRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not found' });
});

// v1 baseline: the full stack trace and SQL text are shown to the user (report 2.1.5)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(
    `<h1>Internal Server Error</h1><pre>${err.stack}</pre>` +
    (err.sql ? `<h3>SQL</h3><pre>${err.sql}</pre>` : '')
  );
});

app.listen(PORT, () => {
  console.log(`SecureBook v1 running at http://localhost:${PORT}`);
});
