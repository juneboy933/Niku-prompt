export interface CradlePaymentConfig {
  baseUrl: string;
  merchantId: string;
  password: string;
  callbackUrl: string;
  redirectUrl: string;
  currency: string;
}

export const CRADLE_PAYMENT_CONFIG = Symbol('CRADLE_PAYMENT_CONFIG');

export function cradlePaymentConfig(): CradlePaymentConfig {
  return {
    baseUrl:
      process.env.CRADLE_PAYMENT_BASE_URL ?? 'https://payment.cradlevoices.com',
    merchantId: process.env.CRADLE_MERCHANT_ID ?? '',
    password: process.env.CRADLE_PASSWORD ?? '',
    callbackUrl:
      process.env.CRADLE_CALLBACK_URL ??
      'http://localhost:3000/api/payments/cradle/callback',
    redirectUrl:
      process.env.CRADLE_REDIRECT_URL ??
      'http://localhost:3000/payment/success',
    currency: process.env.CRADLE_CURRENCY ?? 'KES',
  };
}