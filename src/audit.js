// D: security audit log. Other modules call logEvent() for security events.
// Passwords, session IDs and CSRF tokens are never passed in here.
const pool = require('./db');

async function logEvent(req, eventType, details = '', userId = null) {
  try {
    const uid = userId ?? req.session?.user?.id ?? null;
    const userAgent = (req.get('user-agent') || '').slice(0, 255);
    await pool.query(
      'INSERT INTO audit_logs (event_type, user_id, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?)',
      [eventType, uid, req.ip, userAgent, String(details).slice(0, 500)]
    );
  } catch (err) {
    // Logging must never break the request itself
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logEvent };
