import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentStatus } from '@prisma/client';
import { CRADLE_PAYMENT_CONFIG } from 'src/config/cradle-payment.config';
import { PrismaService } from 'src/prisma/prisma.service';
import { CradlePaymentService } from './cradle/cradle-payment.service';
import { PaymentsService } from './payments.service';

const config = {
  baseUrl: 'https://payment.cradlevoices.com',
  merchantId: 'MERCH123',
  password: 'super_secret',
  callbackUrl: 'https://example.com/api/payments/cradle/callback',
  redirectUrl: 'https://example.com/payment/success',
  currency: 'KES',
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: {
    payment: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let cradle: { initiatePayment: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      payment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
        fn(prisma),
      ),
    };

    cradle = { initiatePayment: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CradlePaymentService, useValue: cradle },
        { provide: CRADLE_PAYMENT_CONFIG, useValue: config },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('initiatePayment', () => {
    beforeEach(() => {
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'pay_1',
          ...data,
        }),
      );
      prisma.payment.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'pay_1',
          ...data,
        }),
      );
      cradle.initiatePayment.mockResolvedValue({
        error: false,
        message: 'queued',
        reference: 'REF123',
      });
    });

    it('creates a PENDING payment, initiates STK push and returns a safe response', async () => {
      const result = await service.initiatePayment({
        phone: '0712345678',
        amount: 100,
      });

      expect(result).toEqual({
        success: true,
        invoiceNumber: 'INV-2026-000001',
        status: PaymentStatus.PROCESSING,
        message: 'STK Push has been sent to your phone.',
      });

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceNumber: 'INV-2026-000001',
            externalId: 'INV-2026-000001',
            merchantId: config.merchantId,
            amount: 100,
            currency: 'KES',
            payerPhone: '254712345678',
            status: PaymentStatus.PENDING,
          }),
        }),
      );

      expect(cradle.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          externalId: 'INV-2026-000001',
          payerPhone: '254712345678',
          amount: 100,
          currency: 'KES',
        }),
      );

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PaymentStatus.PROCESSING,
            providerReference: 'REF123',
          }),
        }),
      );
    });

    it('rejects invalid Kenyan phone numbers', async () => {
      await expect(
        service.initiatePayment({ phone: '12345', amount: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('generates sequential invoice numbers', async () => {
      prisma.payment.findFirst.mockResolvedValueOnce(null);
      prisma.payment.findFirst.mockResolvedValueOnce({
        invoiceNumber: 'INV-2026-000001',
      });

      const first = await service.initiatePayment({
        phone: '254712345678',
        amount: 50,
      });
      const second = await service.initiatePayment({
        phone: '+254712345678',
        amount: 60,
      });

      expect(first.invoiceNumber).toBe('INV-2026-000001');
      expect(second.invoiceNumber).toBe('INV-2026-000002');
    });

    it('marks the payment FAILED and rethrows when the provider rejects the token', async () => {
      cradle.initiatePayment.mockRejectedValue(
        new ServiceUnavailableException('down'),
      );

      await expect(
        service.initiatePayment({ phone: '712345678', amount: 100 }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.FAILED }),
        }),
      );
    });
  });

  describe('findByInvoiceNumber', () => {
    it('returns payment status details', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_1',
        invoiceNumber: 'INV-2026-000001',
        amount: 100,
        currency: 'KES',
        payerPhone: '254712345678',
        status: PaymentStatus.PROCESSING,
        providerReference: 'REF123',
        completedAt: null,
      });

      const result = await service.findByInvoiceNumber('INV-2026-000001');

      expect(result).toEqual({
        invoiceNumber: 'INV-2026-000001',
        amount: 100,
        currency: 'KES',
        phone: '254712345678',
        status: PaymentStatus.PROCESSING,
        providerReference: 'REF123',
        completedAt: undefined,
      });
    });

    it('throws NotFoundException for unknown invoice numbers', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.findByInvoiceNumber('INV-2026-999999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleCradleCallback', () => {
    let current: Record<string, unknown>;

    beforeEach(() => {
      current = {
        id: 'pay_1',
        invoiceNumber: 'INV-2026-000001',
        amount: 100,
        currency: 'KES',
        payerPhone: '254712345678',
        status: PaymentStatus.PROCESSING,
      };
      prisma.payment.findUnique.mockImplementation(async () => ({ ...current }));
      prisma.payment.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          current = { ...current, ...data };
          return { ...current };
        },
      );
    });

    it('stores the raw callback and marks the payment SUCCESS', async () => {
      const payload = {
        externalId: 'INV-2026-000001',
        status: 'SUCCESS',
        receipt: 'QF12345',
      };

      const result = await service.handleCradleCallback(payload);

      expect(result).toEqual({ received: true, acknowledged: true });
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callbackResponse: payload,
            status: PaymentStatus.SUCCESS,
          }),
        }),
      );
    });

    it('does not re-process an already successful payment (idempotent)', async () => {
      await service.handleCradleCallback({
        externalId: 'INV-2026-000001',
        status: 'SUCCESS',
      });
      prisma.payment.update.mockClear();

      await service.handleCradleCallback({
        externalId: 'INV-2026-000001',
        status: 'FAILED',
      });

      expect(prisma.payment.update).toHaveBeenCalledTimes(1);
      const arg = prisma.payment.update.mock
        .calls[0][0] as unknown as { data: Record<string, unknown> };
      expect(arg.data.status).toBeUndefined();
      expect(current.status).toBe(PaymentStatus.SUCCESS);
    });

    it('acknowledges callbacks without a resolvable reference', async () => {
      const result = await service.handleCradleCallback({ foo: 'bar' });

      expect(result).toEqual({ received: true, acknowledged: true });
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });
  });
});