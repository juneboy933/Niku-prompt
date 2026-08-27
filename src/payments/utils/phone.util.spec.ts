import { BadRequestException } from '@nestjs/common';
import {
  maskKenyanPhoneNumber,
  normalizeKenyanPhoneNumber,
} from './phone.util';

describe('normalizeKenyanPhoneNumber', () => {
  it('normalizes common Kenyan formats to 254XXXXXXXXX', () => {
    expect(normalizeKenyanPhoneNumber('0712345678')).toBe('254712345678');
    expect(normalizeKenyanPhoneNumber('712345678')).toBe('254712345678');
    expect(normalizeKenyanPhoneNumber('254712345678')).toBe('254712345678');
    expect(normalizeKenyanPhoneNumber('+254712345678')).toBe('254712345678');
    expect(normalizeKenyanPhoneNumber(' 0712 345 678 ')).toBe('254712345678');
  });

  it('rejects invalid Kenyan numbers', () => {
    expect(() => normalizeKenyanPhoneNumber('12345')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeKenyanPhoneNumber('0204567890')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeKenyanPhoneNumber('071234567')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeKenyanPhoneNumber('')).toThrow(BadRequestException);
  });
});

describe('maskKenyanPhoneNumber', () => {
  it('masks the middle digits', () => {
    expect(maskKenyanPhoneNumber('254712345678')).toBe('2547******678');
  });
});
