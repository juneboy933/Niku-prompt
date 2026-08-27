import { BadRequestException } from '@nestjs/common';

export function normalizeCustomerNumber(phone: string) {
  // '0712345678' , '+254712345678' -> '254712345678'
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('0')) {
    normalized = '254' + normalized.slice(1);
  }

  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new BadRequestException('Invalid phone number format.');
  }

  return normalized;
}
