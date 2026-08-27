export interface CradleAuthResponse {
  error: boolean;
  message: string;
  accessToken: string;
  expires: number;
  expiresIn: number;
  expiresDate: string;
}

export interface CradleProcessRequest {
  merchantId: string;
  currency: string;
  amount: number;
  payerPhone: string;
  externalId: string;
  callbackUrl: string;
  redirectUrl: string;
}

export interface CradleProcessResponse {
  error?: boolean;
  message?: string;
  [key: string]: unknown;
}