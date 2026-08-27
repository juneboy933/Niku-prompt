import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { CRADLE_PAYMENT_CONFIG } from 'src/config/cradle-payment.config';
import type { CradlePaymentConfig } from 'src/config/cradle-payment.config';
import { PrismaService } from 'src/prisma/prisma.service';
import { CradlePaymentService } from './cradle/cradle-payment.service';
import { CradleProcessResponse } from './cradle/cradle.types';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { buildInvoiceNumber, parseInvoiceSequence } from './utils/invoice.util';
import { normalizeKenyanPhoneNumber } from './utils/phone.util';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly maxInvoiceAttempts = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cradlePayment: CradlePaymentService,
    @Inject(CRADLE_PAYMENT_CONFIG) private readonly config: CradlePaymentConfig,
  ) {}

  // Full payment initiation flow: validate -> normalize -> generate invoice ->
  // create PENDING payment -> obtain token -> call /process/ -> update record.
  async initiatePayment(dto: InitiatePaymentDto) {
    const payerPhone = normalizeKenyanPhoneNumber(dto.phone);
    const { payment, invoiceNumber } = await this.createPendingPayment(
      payerPhone,
      dto.amount,
    );
    this.logger.log(`Payment created and invoice generated: ${invoiceNumber}`);

    let providerResponse: CradleProcessResponse;
    try {
      providerResponse = await this.cradlePayment.initiatePayment({
        merchantId: this.config.merchantId,
        currency: this.config.currency,
        amount: dto.amount,
        payerPhone,
        externalId: invoiceNumber,
        callbackUrl: this.config.callbackUrl,
        redirectUrl: this.config.redirectUrl,
      });
    } catch (error) {
      await this.markFailed(payment.id, error);
      throw error;
    }

    const providerReference = this.extractProviderReference(providerResponse);
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PROCESSING,
        providerResponse: providerResponse as Prisma.InputJsonValue,
        ...(providerReference ? { providerReference } : {}),
      },
    });

    this.logger.log(`STK Push requested for invoice ${invoiceNumber}`);
    return {
      success: true,
      invoiceNumber,
      status: updated.status,
      message: 'STK Push has been sent to your phone.',
    };
  }

  // Status view used by the frontend to poll for completion.
  async findByInvoiceNumber(invoiceNumber: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { invoiceNumber },
    });
    if (!payment) {
      throw new NotFoundException(`Payment ${invoiceNumber} not found`);
    }
    return {
      invoiceNumber: payment.invoiceNumber,
      amount: payment.amount,
      currency: payment.currency,
      phone: payment.payerPhone,
      status: payment.status,
      providerReference: payment.providerReference ?? undefined,
      completedAt: payment.completedAt ?? undefined,
    };
  }

  // Cradle callback webhook handler. Raw payload is stored for auditing.
  // Idempotent: a terminal payment is never re-processed.
  async handleCradleCallback(rawPayload: unknown) {
    const payload: Record<string, unknown> =
      rawPayload && typeof rawPayload === 'object'
        ? (rawPayload as Record<string, unknown>)
        : {};

    this.logger.log(`Callback received: ${JSON.stringify(payload)}`);

    const invoiceNumber = this.extractExternalId(payload);
    if (!invoiceNumber) {
      this.logger.warn('Callback received without a resolvable reference.');
      return { received: true, acknowledged: true };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { invoiceNumber },
    });
    if (!payment) {
      this.logger.warn(`Callback received for unknown invoice ${invoiceNumber}`);
      return { received: true, acknowledged: true };
    }

    const nextStatus = this.resolveCallbackStatus(payload);
    const data: Prisma.PaymentUpdateInput = {
      callbackResponse: payload as Prisma.InputJsonValue,
    };

    if (nextStatus && !this.isTerminal(payment.status)) {
      data.status = nextStatus;
      if (nextStatus !== PaymentStatus.EXPIRED) {
        data.completedAt = new Date();
      }
      if (nextStatus === PaymentStatus.SUCCESS) {
        this.logger.log(`Payment ${invoiceNumber} successful`);
      } else {
        this.logger.log(`Payment ${invoiceNumber} failed`);
      }
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data,
    });

    return { received: true, acknowledged: true };
  }

  // Generates a unique sequential invoice number inside a transaction and
  // creates the PENDING payment. Relies on the database unique constraint to
  // make concurrent generation safe, retrying on unique violations.
  private async createPendingPayment(payerPhone: string, amount: number) {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxInvoiceAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const invoiceNumber = await this.nextInvoiceNumber(tx);
          const payment = await tx.payment.create({
            data: {
              invoiceNumber,
              externalId: invoiceNumber,
              merchantId: this.config.merchantId,
              amount,
              currency: this.config.currency,
              payerPhone,
              status: PaymentStatus.PENDING,
            },
          });
          return { payment, invoiceNumber };
        });
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Could not generate a unique invoice number. Please try again later.',
      { cause: lastError },
    );
  }

  private async nextInvoiceNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const latest = await tx.payment.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const sequence = latest
      ? parseInvoiceSequence(latest.invoiceNumber, year) ?? 0
      : 0;
    return buildInvoiceNumber(sequence + 1, year);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isTerminal(status: PaymentStatus): boolean {
    return (
      status === PaymentStatus.SUCCESS ||
      status === PaymentStatus.FAILED ||
      status === PaymentStatus.EXPIRED
    );
  }

  private async markFailed(paymentId: string, error: unknown) {
    const payload =
      error instanceof HttpException
        ? (error.getResponse() as Record<string, unknown>)
        : { message: 'Payment initiation failed' };
    this.logger.error(`Payment init failed for payment ${paymentId}`);
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.FAILED,
        completedAt: new Date(),
        providerResponse: payload as Prisma.InputJsonValue,
      },
    });
  }

  private extractProviderReference(
    response: CradleProcessResponse,
  ): string | undefined {
    const candidates = [
      'reference',
      'providerReference',
      'merchantRequestID',
      'merchantRequestId',
      'transactionId',
      'receipt',
    ];
    for (const key of candidates) {
      const value = response[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return undefined;
  }

  private extractExternalId(
    payload: Record<string, unknown>,
  ): string | undefined {
    const candidates = ['externalId', 'external_id', 'invoiceNumber', 'invoice'];
    for (const key of candidates) {
      const value = payload[key];
      if (typeof value === 'string' && value.startsWith('INV-')) {
        return value;
      }
    }
    return undefined;
  }

  private resolveCallbackStatus(
    payload: Record<string, unknown>,
  ): PaymentStatus | null {
    if (payload['error'] === true) {
      return PaymentStatus.FAILED;
    }

    const keys = ['status', 'paymentStatus', 'resultCode', 'ResultCode', 'code'];
    for (const key of keys) {
      const value = payload[key];
      if (typeof value !== 'string') {
        continue;
      }
      const normalized = value.toLowerCase();
      if (
        normalized.includes('success') ||
        normalized.includes('paid') ||
        normalized.includes('complete')
      ) {
        return PaymentStatus.SUCCESS;
      }
      if (
        normalized.includes('fail') ||
        normalized.includes('error') ||
        normalized.includes('cancelled') ||
        normalized.includes('cancel')
      ) {
        return PaymentStatus.FAILED;
      }
      if (normalized.includes('expired')) {
        return PaymentStatus.EXPIRED;
      }
    }
    return null;
  }
}