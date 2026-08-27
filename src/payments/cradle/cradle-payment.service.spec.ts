import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CRADLE_PAYMENT_CONFIG } from 'src/config/cradle-payment.config';
import { CradleAuthService } from './cradle-auth.service';
import { CradlePaymentService } from './cradle-payment.service';
import { CradleProcessRequest } from './cradle.types';

jest.mock('axios', () => {
  const mockPost = jest.fn();
  const mockIsAxiosError = jest.fn(
    (err: unknown) =>
      !!err &&
      typeof err === 'object' &&
      (err as { isAxiosError?: boolean }).isAxiosError === true,
  );
  const axiosMock = { post: mockPost, isAxiosError: mockIsAxiosError };
  return { ...axiosMock, default: axiosMock, __esModule: true };
});

import axiosModule from 'axios';

const mockedAxiosPost = axiosModule.post as jest.Mock;

const config = {
  baseUrl: 'https://payment.cradlevoices.com',
  merchantId: 'MERCH123',
  password: 'super_secret',
  callbackUrl: 'https://example.com/api/payments/cradle/callback',
  redirectUrl: 'https://example.com/payment/success',
  currency: 'KES',
};

const payload: CradleProcessRequest = {
  merchantId: config.merchantId,
  currency: 'KES',
  amount: 100,
  payerPhone: '254712345678',
  externalId: 'INV-2026-000001',
  callbackUrl: config.callbackUrl,
  redirectUrl: config.redirectUrl,
};

function axiosError(status: number | undefined): Error & {
  isAxiosError: boolean;
} {
  const error = new Error('provider error') as Error & {
    isAxiosError: boolean;
  };
  error.isAxiosError = true;
  if (status) {
    (error as { response?: object }).response = { status };
  }
  return error;
}

describe('CradlePaymentService', () => {
  let service: CradlePaymentService;
  let auth: { getValidAccessToken: jest.Mock; clearToken: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    auth = {
      getValidAccessToken: jest.fn().mockResolvedValue('VALID_TOKEN'),
      clearToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CradlePaymentService,
        CradleAuthService,
        { provide: CRADLE_PAYMENT_CONFIG, useValue: config },
        { provide: CradleAuthService, useValue: auth },
      ],
    }).compile();

    service = module.get<CradlePaymentService>(CradlePaymentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('posts to /process/ with a bearer access token', async () => {
    mockedAxiosPost.mockResolvedValueOnce({
      data: { error: false, message: 'queued', reference: 'REF123' },
    });

    const result = await service.initiatePayment(payload);

    expect(mockedAxiosPost).toHaveBeenCalledWith(
      `${config.baseUrl}/process/`,
      payload,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer VALID_TOKEN',
        }),
      }),
    );
    expect(result.reference).toBe('REF123');
  });

  it('clears the token and retries exactly once on a 401 response', async () => {
    mockedAxiosPost
      .mockRejectedValueOnce(axiosError(401))
      .mockResolvedValueOnce({ data: { error: false, message: 'ok' } });

    await service.initiatePayment(payload);

    expect(auth.clearToken).toHaveBeenCalled();
    expect(auth.getValidAccessToken).toHaveBeenCalledTimes(2);
    expect(mockedAxiosPost).toHaveBeenCalledTimes(2);
  });

  it('does not retry infinitely on repeated auth failure', async () => {
    mockedAxiosPost.mockRejectedValue(axiosError(401));

    await expect(service.initiatePayment(payload)).rejects.toThrow();

    expect(auth.clearToken).toHaveBeenCalledTimes(2);
    expect(mockedAxiosPost).toHaveBeenCalledTimes(2);
  });

  it('maps provider network outages to ServiceUnavailableException', async () => {
    mockedAxiosPost.mockRejectedValueOnce(axiosError(undefined));

    await expect(service.initiatePayment(payload)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('maps provider 5xx responses to ServiceUnavailableException', async () => {
    mockedAxiosPost.mockRejectedValueOnce(axiosError(503));

    await expect(service.initiatePayment(payload)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
