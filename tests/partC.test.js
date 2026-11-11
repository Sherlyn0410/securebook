// C: automated security tests for Part C (input validation, SQL injection,
// XSS and error handling). No database or server is needed.
// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ejs = require('ejs');

// Swap the real audit logger for a fake one that just remembers what was
// logged, so these tests do not need MySQL running.
const logged = [];
const auditPath = require.resolve('../src/audit');
const fakeAudit = new Module(auditPath);
fakeAudit.filename = auditPath;
fakeAudit.loaded = true;
fakeAudit.exports = { logEvent: (req, type, details) => logged.push({ type, details }) };
require.cache[auditPath] = fakeAudit;

const { rules, getErrors } = require('../src/validation');
const VIEWS = path.join(__dirname, '..', 'src', 'views');

// Runs a list of rules against a fake request and returns the error messages.
async function check(ruleList, { body = {}, query = {}, params = {} } = {}) {
  const req = { body, query, params, method: 'POST', originalUrl: '/test', get: () => '' };
  for (const rule of ruleList) await rule.run(req);
  return { errors: getErrors(req), req };
}

// A date N days from today, written like 2026-11-14.
function daysFromToday(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
}

// ---------- 2.1.4(b) SQL injection ----------

test('SQLi: attack strings in the date filter are rejected', async () => {
  const attacks = [
    "' OR '1'='1",
    "2026-12-01' OR '1'='1",
    "2026-12-01'; DROP TABLE bookings;--",
    "2026-12-01 UNION SELECT email, password FROM users",
    '2026-12-01T10:00:00'
  ];
  for (const date of attacks) {
    const { errors } = await check(rules.dateFilter, { query: { date } });
    assert.deepStrictEqual(errors, ['Invalid date.'], `should reject: ${date}`);
  }
});

test('SQLi: a normal date, or no date, is accepted', async () => {
  assert.deepStrictEqual((await check(rules.dateFilter, { query: { date: '2026-12-01' } })).errors, []);
  assert.deepStrictEqual((await check(rules.dateFilter, { query: {} })).errors, []);
});

test('SQLi: an impossible date like 2026-02-30 is rejected', async () => {
  const { errors } = await check(rules.dateFilter, { query: { date: '2026-02-30' } });
  assert.deepStrictEqual(errors, ['Invalid date.']);
});

test('SQLi: booking ID in the URL must be a plain number', async () => {
  const bad = await check(rules.bookingId, { params: { id: '1 OR 1=1' } });
  assert.deepStrictEqual(bad.errors, ['Invalid booking.']);

  const good = await check(rules.bookingId, { params: { id: '5' } });
  assert.deepStrictEqual(good.errors, []);
  assert.strictEqual(good.req.params.id, 5); // converted to a real number
});

// ---------- 2.1.4(a) Input validation ----------

test('Validation: booking notes over 500 characters are rejected', async () => {
  const tooLong = await check(rules.booking, { body: { slot_id: '3', notes: 'a'.repeat(501) } });
  assert.deepStrictEqual(tooLong.errors, ['Notes must be 500 characters or fewer.']);

  const ok = await check(rules.booking, { body: { slot_id: '3', notes: 'a'.repeat(500) } });
  assert.deepStrictEqual(ok.errors, []);
});

test('Validation: slot_id must be a positive whole number', async () => {
  for (const slot_id of ['abc', '0', '-1', '2.5', '']) {
    const { errors } = await check(rules.booking, { body: { slot_id } });
    assert.deepStrictEqual(errors, ['Invalid time slot.'], `should reject slot_id=${slot_id}`);
  }
});

test('Validation: names with HTML or symbols are rejected, real names pass', async () => {
  const bad = await check(rules.profile, { body: { name: '<script>alert(1)</script>' } });
  assert.ok(bad.errors.includes('Name can only contain letters, spaces, dots, apostrophes and hyphens.'));

  for (const name of ["Mary-Jane O'Neil", 'Józef Nowak', 'Tan Jia Xin']) {
    assert.deepStrictEqual((await check(rules.profile, { body: { name } })).errors, [], `should accept: ${name}`);
  }
});

test('Validation: email and Malaysian phone format are enforced', async () => {
  const badEmail = await check(rules.register, { body: { name: 'Joel Vincent', email: 'not-an-email' } });
  assert.ok(badEmail.errors.includes('Enter a valid email address.'));

  const badPhone = await check(rules.register, { body: { name: 'Joel Vincent', email: 'joel@example.com', phone: '12345' } });
  assert.ok(badPhone.errors.includes('Enter a Malaysian mobile number, e.g. 012-3456789.'));

  const good = await check(rules.register, { body: { name: 'Joel Vincent', email: 'joel@example.com', phone: '012-3456789' } });
  assert.deepStrictEqual(good.errors, []);
});

test('Validation: admin cannot create a slot in the past or ending before it starts', async () => {
  const past = await check(rules.slot, {
    body: { service_id: '1', slot_date: daysFromToday(-1), start_time: '10:00', end_time: '10:30' }
  });
  assert.ok(past.errors.includes('Date cannot be in the past.'));

  const backwards = await check(rules.slot, {
    body: { service_id: '1', slot_date: daysFromToday(7), start_time: '11:00', end_time: '10:00' }
  });
  assert.ok(backwards.errors.includes('End time must be after start time.'));

  const ok = await check(rules.slot, {
    body: { service_id: '1', slot_date: daysFromToday(7), start_time: '10:00', end_time: '10:30' }
  });
  assert.deepStrictEqual(ok.errors, []);
});

test('Validation: rejected input is audit-logged by field name, never by value', async () => {
  logged.length = 0;
  const secretNote = 'SECRET-' + 'x'.repeat(600);
  await check(rules.booking, { body: { slot_id: '3', notes: secretNote } });

  assert.strictEqual(logged.length, 1);
  assert.strictEqual(logged[0].type, 'VALIDATION_FAILED');
  assert.ok(logged[0].details.includes('notes'));
  assert.ok(!logged[0].details.includes('SECRET'), 'the note text must not be logged');
});

// ---------- 2.1.4(c) Cross-site scripting ----------

test('XSS: <%= escapes a script so the browser shows it as text', () => {
  const html = ejs.render('<td class="notes"><%= notes %></td>', { notes: '<script>alert(1)</script>' });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('XSS: no view prints raw, unescaped data with <%-', () => {
  const offenders = [];
  (function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(full); continue; }
      if (!entry.name.endsWith('.ejs')) continue;
      fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
        // <%- is only allowed for including other templates
        if (/<%-(?!\s*include\()/.test(line)) offenders.push(`${path.relative(VIEWS, full)}:${i + 1}`);
      });
    }
  })(VIEWS);
  assert.deepStrictEqual(offenders, [], `raw output found in: ${offenders.join(', ')}`);
});

// ---------- 2.1.5 Error handling ----------

test('Error page: shows a reference code and no technical details', async () => {
  const html = await ejs.renderFile(path.join(VIEWS, 'error.ejs'), {
    title: 'Something went wrong', ref: 'a1b2c3d4', csrfToken: 'test'
  });
  assert.ok(html.includes('Something went wrong'));
  assert.ok(html.includes('a1b2c3d4'));
  for (const leak of ['Error:', 'at ', 'node_modules', 'SELECT', '.js:']) {
    assert.ok(!html.includes(leak), `error page must not contain "${leak}"`);
  }
});
