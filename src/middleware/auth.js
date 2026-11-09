// Only checks that someone is logged in.
// v1 baseline: there is no role check, so admin routes are open to any
// logged-in user (report 2.1.3.2).
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

module.exports = { requireLogin };
