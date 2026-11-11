const { rateLimit } = require('express-rate-limit');
const { logEvent } = require('../audit');

function blocked(eventType) {
  return (req, res) => {
    logEvent(req, eventType, `${req.method} ${req.originalUrl}`);
    res.status(429).render('message', {
      title: 'Too many requests',
      message: 'You have made too many requests. Please wait a while and try again.'
    });
  };
}

// A: slows down password guessing from one IP address
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: blocked('RATE_LIMITED_LOGIN')
});

// B: stops scripts from creating bookings in bulk (per logged-in user)
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `user-${req.session.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: blocked('RATE_LIMITED_BOOKING')
});

// B: limits fake account creation from one IP address
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: blocked('RATE_LIMITED_REGISTER')
});

module.exports = { loginLimiter, bookingLimiter, registerLimiter };
