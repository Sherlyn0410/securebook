// A: password policy based on NIST SP 800-63B-4: passwords used without MFA
// must be at least 15 characters, no forced symbols, common passwords refused.
const COMMON_PASSWORDS = new Set([
  'passwordpassword', '123456789012345', '1234567890123456', 'qwertyuiopasdfg', 'password1234567',
  'iloveyou1234567', 'abcdefghijklmno', 'welcome12345678', 'qwerty123456789', '1q2w3e4r5t6y7u8',
  'aaaaaaaaaaaaaaa', 'letmein12345678', 'securebook12345', 'appointment1234'
]);

function checkPassword(password, email = '') {
  if (password.length < 15) return 'Password must be at least 15 characters.';
  if (password.length > 64) return 'Password must be 64 characters or fewer.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'This password is too common. Please choose another.';

  const emailName = email.split('@')[0].toLowerCase();
  if (emailName.length >= 4 && password.toLowerCase().includes(emailName)) {
    return 'Password must not contain your email name.';
  }
  return null;
}

module.exports = { checkPassword };
