import assert from 'node:assert/strict';
import test from 'node:test';
import { getBirthdayPassword, matchesBirthdayPassword } from './auth';

const birthdayConfig = {
  dateOfBirthISO: '2000-02-29',
  dateFormat: 'DD/MM/YYYY',
  placeholderPassword: 'CHANGE_ME',
};

test('birthday password honors the configured date format without displaying it', () => {
  assert.equal(getBirthdayPassword(birthdayConfig), '29/02/2000');
  assert.equal(matchesBirthdayPassword('  29/02/2000  ', birthdayConfig), true);
  assert.equal(matchesBirthdayPassword('02/29/2000', birthdayConfig), false);
});

test('invalid or unset birthday configuration safely falls back to its setup placeholder', () => {
  assert.equal(getBirthdayPassword({ ...birthdayConfig, dateOfBirthISO: '' }), 'CHANGE_ME');
  assert.equal(getBirthdayPassword({ ...birthdayConfig, dateOfBirthISO: '2001-02-29' }), 'CHANGE_ME');
});
