import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CRADLE_PAYMENT_CONFIG } from 'src/config/cradle-payment.config';
import { CradleAuthService } from './cradle-auth.service';

const mockGet = jest.fn();
const mockIsAxiosError = (err: unknown): boolean =>
  !!err &&
  typeof err === 'object' &&
  (err as { isAxiosError?: boolean }).isAxiosError === true;

jest.mock('axios', () => {
  const axiosMock = { get: mockGet, isAxiosError: mockIsAxiosError };
  return { ...axiosMock, default: axiosMock, __esModule: true };
});

const config = {
  baseUrl: 'https://payment.cradlevoices.com',
  merchantId: 'MERCH123',
  password: 'super_secret',
  callbackUrl: 'https://example.com/api/payments/cradle/callback',
  redirectUrl: 'https://example.com/payment/success',
  currency: 'KES',
};

const tokenResponse = {
  error: false,
  message: 'Token Success',
  accessToken: 'ACCESS_TOKEN',
  expires: 1787833494,
  expiresIn: 3600,
  expiresDate: '2026-08-27T12:24:54+00:00',
};

describe('CradleAuthService', () => {
  let service: CradleAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: tokenResponse });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CradleAuthService,
        { provide: CRADLE_PAYMENT_CONFIG, useValue: config },
      ],
    }).compile();

    service = module.get<CradleAuthService>(CradleAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('authenticates using Base64(merchantId:password) basic credentials', async () => {
    await service.getValidAccessToken();

    const expectedBasic = Buffer.from(
      `${config.merchantId}:${config.password}`,
    ).toString('base64');

    expect(mockGet).toHaveBeenCalledWith(
      `${config.baseUrl}/auth/`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${expectedBasic}`,
          Accept: 'application/json',
        }),
      }),
    );
  });

  it('caches the token and avoids repeated authentication requests', async () => {
    const first = await service.getValidAccessToken();
    const second = await service.getValidAccessToken();

    expect(first).toBe('ACCESS_TOKEN');
    expect(second).toBe('ACCESS_TOKEN');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent token requests into a single call', async () => {
    const [first, second] = await Promise.all([
      service.getValidAccessToken(),
      service.getValidAccessToken(),
    ]);

    expect(first).toBe('ACCESS_TOKEN');
    expect(second).toBe('ACCESS_TOKEN');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token within the 60s pre-expiry buffer', async () => {
    await service.getValidAccessToken();

    // Force the cached token to expire in 30s (< 60s buffer).
    const serviceAny = service as unknown as { expiresAt: number };
    serviceAny.expiresAt = Date.now() + 30 * 1000;

    await service.getValidAccessToken();

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('throws UnauthorizedException when no access token is returned', async () => {
    mockGet.mockResolvedValueOnce({
      data: { error: true, message: 'Denied' },
    });

    await expect(service.getValidAccessToken()).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('clears the cached token', async () => {
    await service.getValidAccessToken();
    service.clearToken();

    expect(service.isTokenValid()).toBe(false);
  });
});