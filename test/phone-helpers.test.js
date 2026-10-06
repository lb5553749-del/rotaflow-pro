'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DDD_PADRAO,
  getDigits,
  getNationalDigits,
  formatPhoneNumber,
  formatPhoneShort,
  normalizeStoredPhone,
  getWhatsAppPhoneDigits
} = require('../lib/phone-helpers.js');

describe('getDigits / getNationalDigits', () => {
  it('strips non-digits and the country code', () => {
    assert.equal(getDigits('(69) 99999-1234'), '69999991234');
    assert.equal(getNationalDigits('+55 69 99999-1234'), '69999991234');
  });
});

describe('formatPhoneNumber / formatPhoneShort', () => {
  it('adds the default DDD to local numbers', () => {
    assert.equal(DDD_PADRAO, '69');
    assert.equal(formatPhoneNumber('999991234'), '+55 69 9 9999-1234');
    assert.equal(formatPhoneNumber('6999991234'), '+55 69 9999-1234');
    assert.equal(formatPhoneNumber('123'), '');
    assert.equal(formatPhoneShort('+55 69 99999-1234'), '69 9 9999-1234');
  });
});

describe('normalizeStoredPhone / getWhatsAppPhoneDigits', () => {
  it('peels a duplicated default DDD from legacy storage', () => {
    assert.equal(normalizeStoredPhone('6969999991234'), '+55 69 9 9999-1234');
  });

  it('builds WhatsApp digits with country code', () => {
    assert.equal(getWhatsAppPhoneDigits('999991234'), '5569999991234');
    assert.equal(getWhatsAppPhoneDigits('+55 69 99999-1234'), '5569999991234');
  });
});
