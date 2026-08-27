import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { CRADLE_PAYMENT_CONFIG } from 'src/config/cradle-payment.config';
import type { CradlePaymentConfig } from 'src/config/cradle-payment.config';
import {
  CRADLE_AUTH_TIMEOUT_MS,
  CRADLE_TOKEN_LIFETIME_MS,
  CRADLE_TOKEN_REFRESH_BUFFER_MS,
} from './cradle.constants';
import { CradleAuthResponse } from './cradle.types';

@Injectable()
export class CradleAuthService {
  private readonly logger = new Logger(CradleAuthService.name);

  private token: string | null = null;
  private expiresAt = 0;
  private inFlight: Promise<string> | null = null;

  constructor(
    @Inject(CRADLE_PAYMENT_CONFIG) private readonly config: CradlePaymentConfig,
  ) {}

  isTokenValid(): boolean {
    return (
      this.token !== null &&
      Date.now() < this.expiresAt - CRADLE_TOKEN_REFRESH_BUFFER_MS
    );
  }

  // Returns a valid, cached access token. Coalesces concurrent calls so only
  // a single authentication request is made at a time.
  async getValidAccessToken(): Promise<string> {
    if (this.isTokenValid() && this.token !== null) {
      return this.token;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.authenticate().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async authenticate(): Promise<string> {
    const credentials = Buffer.from(
      `${this.config.merchantId}:${this.config.password}`,
    ).toString('base64');

    this.logger.log('Requesting Cradle access token');
    const response = await axios.get<CradleAuthResponse>(
      `${this.config.baseUrl}/auth/`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: 'application/json',
        },
        timeout: CRADLE_AUTH_TIMEOUT_MS,
      },
    );

    const data = response.data;
    if (!data || !data.accessToken) {
      throw new UnauthorizedException(
        'Cradle authentication failed: no access token returned.',
      );
    }

    const expiresInMs = data.expiresIn
      ? data.expiresIn * 1000
      : CRADLE_TOKEN_LIFETIME_MS;
    this.token = data.accessToken;
    this.expiresAt = Date.now() + expiresInMs;
    this.logger.log('Cradle access token refreshed');
    return this.token;
  }

  clearToken(): void {
    this.token = null;
    this.expiresAt = 0;
  }
}
