// B: CSRF protection using the synchroniser token pattern.
// Each session gets a random token. Every form sends it back in a hidden
// field, and POST requests without the matching token are rejected.
const crypto = require('crypto');
const { logEvent } = require('../audit');

function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (req.method !== 'POST') {
    return next();
  }

  const sent = Buffer.from(String(req.body?._csrf || ''));
  const expected = Buffer.from(req.session.csrfToken);
  const valid = sent.length === expected.length && crypto.timingSafeEqual(sent, expected);

  if (!valid) {
    logEvent(req, 'CSRF_REJECTED', `${req.method} ${req.originalUrl}`);
    return res.status(403).render('message', {
      title: 'Request blocked',
      message: 'This form has expired or was not sent from SecureBook. Please go back, refresh the page and try again.'
    });
  }
  next();
}

module.exports = { csrfProtection };