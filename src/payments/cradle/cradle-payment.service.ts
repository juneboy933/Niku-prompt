import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { CRADLE_PAYMENT_CONFIG } from 'src/config/cradle-payment.config';
import type { CradlePaymentConfig } from 'src/config/cradle-payment.config';
import { CRADLE_REQUEST_TIMEOUT_MS } from './cradle.constants';
import { CradleAuthService } from './cradle-auth.service';
import { CradleProcessRequest, CradleProcessResponse } from './cradle.types';

@Injectable()
export class CradlePaymentService {
  private readonly logger = new Logger(CradlePaymentService.name);

  constructor(
    @Inject(CRADLE_PAYMENT_CONFIG) private readonly config: CradlePaymentConfig,
    private readonly auth: CradleAuthService,
  ) {}

  // Initiate an STK Push via the Cradle /process/ endpoint.
  // If the provider rejects the token, clear it, obtain a fresh token and
  // retry exactly once. Never creates infinite retry loops.
  async initiatePayment(
    payload: CradleProcessRequest,
  ): Promise<CradleProcessResponse> {
    try {
      return await this.postProcess(payload);
    } catch (error) {
      if (this.isAuthError(error)) {
        this.logger.warn(
          'Cradle rejected the access token; refreshing and retrying once',
        );
        this.auth.clearToken();
        const freshToken = await this.auth.getValidAccessToken();
        try {
          return await this.postProcess(payload, freshToken);
        } catch (retryError) {
          if (this.isAuthError(retryError)) {
            this.auth.clearToken();
          }
          this.throwMappedError(retryError);
        }
      }
      this.throwMappedError(error);
    }
  }

  private isAuthError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = (error as AxiosError).response?.status;
      return status === 401 || status === 403;
    }
    return false;
  }

  private async postProcess(
    payload: CradleProcessRequest,
    token?: string,
  ): Promise<CradleProcessResponse> {
    const accessToken = token ?? (await this.auth.getValidAccessToken());
    const encodedToken = Buffer.from(accessToken, 'utf8').toString('base64');
    this.logger.log(`STK Push requested for externalId ${payload.externalId}`);
    const response = await axios.post<CradleProcessResponse>(
      `${this.config.baseUrl}/process/`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${encodedToken}`,
        },
        timeout: CRADLE_REQUEST_TIMEOUT_MS,
      },
    );
    this.logger.log(
      `Provider response received for externalId ${payload.externalId}`,
    );
    return response.data;
  }

  private throwMappedError(error: unknown): never {
    if (axios.isAxiosError(error)) {
      const status = (error as AxiosError).response?.status;
      if (!status || status >= 500) {
        throw new ServiceUnavailableException(
          'Payment provider is currently unavailable. Please try again later.',
        );
      }
    }
    throw error;
  }
}