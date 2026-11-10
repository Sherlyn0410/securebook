require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const pool = require('./db');
const { csrfProtection } = require('./middleware/csrf');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const pageRoutes = require('./routes/pages');

// D: refuse to start without a real session secret
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET in .env must be at least 32 characters.');
  process.exit(1);
}

const app = express();
const APP_HOST = process.env.APP_HOST || 'localhost';
const HTTP_PORT = Number(process.env.HTTP_PORT || 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// D: security headers (CSP, HSTS, no X-Powered-By, clickjacking protection, ...)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true }
}));

app.use(express.urlencoded({ extended: false, limit: '10kb' }));   // C: reject oversized bodies
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  name: 'sb.sid',                      // D: hide the default "connect.sid" name
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,                       // A: every request restarts the idle timer
  cookie: {
    httpOnly: true,                    // D: JavaScript cannot read the cookie
    secure: true,                      // D: cookie only sent over HTTPS
    sameSite: 'lax',                   // D: not sent on cross-site POSTs
    maxAge: 15 * 60 * 1000             // A: 15-minute idle timeout
  }
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use(csrfProtection);               // B: CSRF token on every POST

app.get('/', async (req, res) => {
  const [services] = await pool.query('SELECT * FROM services ORDER BY id');
  res.render('index', { title: 'Home', services });
});

app.use(pageRoutes);
app.use(authRoutes);
app.use(bookingRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not found' });
});

// C: one central error handler. The user sees a friendly page with a
// reference code; the details stay in the server log only.
app.use((err, req, res, next) => {
  const ref = crypto.randomBytes(4).toString('hex');
  console.error(`[error ${ref}]`, err);
  if (err.type === 'entity.too.large') {
    return res.status(413).render('message', { title: 'Request too large', message: 'The form you sent is too large.' });
  }
  res.status(500).render('error', { title: 'Something went wrong', ref });
});

// D: HTTPS server (TLS 1.2 minimum) using the certificate in /certs
const tlsOptions = {
  key: fs.readFileSync(process.env.TLS_KEY_PATH || path.join(__dirname, '..', 'certs', 'localhost-key.pem')),
  cert: fs.readFileSync(process.env.TLS_CERT_PATH || path.join(__dirname, '..', 'certs', 'localhost.pem')),
  minVersion: 'TLSv1.2'
};

https.createServer(tlsOptions, app).listen(HTTPS_PORT, () => {
  console.log(`SecureBook running at https://${APP_HOST}:${HTTPS_PORT}`);
});

// D: plain HTTP only redirects to HTTPS (fixed host, so the Host header cannot be abused)
http.createServer((req, res) => {
  res.writeHead(301, { Location: `https://${APP_HOST}:${HTTPS_PORT}${req.url}` });
  res.end();
}).listen(HTTP_PORT, () => {
  console.log(`HTTP on port ${HTTP_PORT} redirects to HTTPS`);
});
