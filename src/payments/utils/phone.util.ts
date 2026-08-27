import { BadRequestException } from '@nestjs/common';

export function normalizeKenyanPhoneNumber(phone: string): string {
  if (!phone || typeof phone !== 'string' || phone.trim() === '') {
    throw new BadRequestException('Invalid Kenyan phone number.');
  }

  let normalized = phone.trim().replace(/\D/g, '');
  if (normalized.startsWith('0')) {
    normalized = `254${normalized.slice(1)}`;
  } else if (normalized.length === 9 && normalized.startsWith('7')) {
    normalized = `254${normalized}`;
  }

  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new BadRequestException('Invalid Kenyan phone number format.');
  }

  return normalized;
}

export function maskKenyanPhoneNumber(phone: string): string {
  const normalized = phone.replace(/\D/g, '');
  if (normalized.length < 7) {
    return '***';
  }
  return `${normalized.slice(0, 4)}******${normalized.slice(-3)}`;
}