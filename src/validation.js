// C: shared server-side validation rules (express-validator).
// Allow-list style: each field must match what is expected, otherwise it is rejected.
const { body, param, query, validationResult } = require('express-validator');
const { logEvent } = require('./audit');

// A plain calendar date like 2026-11-14 (no time part, no extra text).
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

const name = body('name').trim()
  .isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 characters.')
  .matches(/^[\p{L} .'-]+$/u).withMessage('Name can only contain letters, spaces, dots, apostrophes and hyphens.');

const email = body('email').trim()
  .isEmail().withMessage('Enter a valid email address.')
  .isLength({ max: 255 })
  .normalizeEmail({ gmail_remove_dots: false });

const phonePrefix = body('phone_prefix').optional({ values: 'falsy' })
  .matches(/^01[0-9]$/).withMessage('Choose a valid phone prefix.');

const phoneNumber = body('phone_number').optional({ values: 'falsy' }).trim()
  .matches(/^\d{7,8}$/).withMessage('Phone number must be 7 or 8 digits.');

const rules = {
  register: [name, email, body('phone').optional({ values: 'falsy' }).trim()
    .matches(/^01[0-9]-?\d{7,8}$/).withMessage('Enter a Malaysian mobile number, e.g. 012-3456789.')],
  login: [email, body('password').isLength({ min: 1, max: 128 }).withMessage('Enter your password.')],
  profile: [name, phonePrefix, phoneNumber],
  booking: [
    body('slot_id').isInt({ min: 1 }).withMessage('Invalid time slot.').toInt(),
    body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be 500 characters or fewer.')
  ],
  bookingId: [param('id').isInt({ min: 1 }).withMessage('Invalid booking.').toInt()],
  // Part of the SQL injection fix: the date filter must be a real date, nothing else.
  dateFilter: [query('date').optional({ values: 'falsy' })
    .matches(DATE_ONLY).withMessage('Invalid date.')
    .bail()
    .isISO8601({ strict: true }).withMessage('Invalid date.')],
  service: [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Service name must be 2 to 100 characters.'),
    body('description').optional().trim().isLength({ max: 255 }).withMessage('Description must be 255 characters or fewer.'),
    body('duration_min').isInt({ min: 5, max: 480 }).withMessage('Duration must be between 5 and 480 minutes.').toInt()
  ],
  slot: [
    body('service_id').isInt({ min: 1 }).withMessage('Choose a service.').toInt(),
    body('slot_date').matches(DATE_ONLY).withMessage('Enter a valid date.')
      .bail()
      .isISO8601({ strict: true }).withMessage('Enter a valid date.')
      .custom((value) => value >= new Date().toLocaleDateString('en-CA')).withMessage('Date cannot be in the past.'),
    body('start_time').matches(TIME_24H).withMessage('Enter a valid start time.'),
    body('end_time').matches(TIME_24H).withMessage('Enter a valid end time.')
      .custom((value, { req }) => value > req.body.start_time).withMessage('End time must be after start time.')
  ],
  id: [param('id').isInt({ min: 1 }).withMessage('Invalid ID.').toInt()]
};

// Returns a list of error messages, or an empty list if the input is valid.
// Rejected input is recorded in the audit log (field names only, not values).
function getErrors(req) {
  const result = validationResult(req);
  if (result.isEmpty()) return [];
  const fields = [...new Set(result.array().map((e) => e.path))].join(', ');
  logEvent(req, 'VALIDATION_FAILED', `${req.method} ${req.originalUrl} fields: ${fields}`);
  return [...new Set(result.array().map((e) => e.msg))];
}

module.exports = { rules, getErrors };
