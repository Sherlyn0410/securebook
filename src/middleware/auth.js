const { logEvent } = require('../audit');

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// B: role-based access control, checked on the server for every request
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    if (req.session.user.role !== role) {
      logEvent(req, 'ACCESS_DENIED', `${req.method} ${req.originalUrl}`);
      return res.status(403).render('message', {
        title: 'Access denied',
        message: 'You do not have permission to view this page.'
      });
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };