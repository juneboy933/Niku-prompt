import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentStatus } from '@prisma/client';
import { CRADLE_PAYMENT_CONFIG } from 'src/config/cradle-payment.config';
import { InvoiceService } from 'src/invoice/invoice.service';
import { LedgerService } from 'src/ledger/ledger.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SmsService } from 'src/sms/sms.service';
import { TransactionService } from 'src/transaction/transaction.service';
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
    transaction: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let cradle: { initiatePayment: jest.Mock };
  let invoiceService: {
    findInvoice: jest.Mock;
    markPaymentPending: jest.Mock;
  };
  let ledgerService: { recordSettlement: jest.Mock };
  let smsService: { sendSettlementConfirmation: jest.Mock };
  let transactionService: {
    createTransaction: jest.Mock;
    markAsFailed: jest.Mock;
    markAsPushed: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      payment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      transaction: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    cradle = { initiatePayment: jest.fn() };
    invoiceService = {
      findInvoice: jest.fn(),
      markPaymentPending: jest.fn(),
    };
    ledgerService = { recordSettlement: jest.fn() };
    smsService = { sendSettlementConfirmation: jest.fn() };
    transactionService = {
      createTransaction: jest.fn(),
      markAsFailed: jest.fn(),
      markAsPushed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CradlePaymentService, useValue: cradle },
        { provide: InvoiceService, useValue: invoiceService },
        { provide: LedgerService, useValue: ledgerService },
        { provide: SmsService, useValue: smsService },
        { provide: TransactionService, useValue: transactionService },
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
      prisma.payment.findUnique.mockImplementation(async () => ({
        ...current,
      }));
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
      const arg = prisma.payment.update.mock.calls[0][0] as unknown as {
        data: Record<string, unknown>;
      };
      expect(arg.data.status).toBeUndefined();
      expect(current.status).toBe(PaymentStatus.SUCCESS);
    });

    it('acknowledges callbacks without a resolvable reference', async () => {
      const result = await service.handleCradleCallback({ foo: 'bar' });

      expect(result).toEqual({ received: true, acknowledged: true });
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('initiateInvoicePayment', () => {
    beforeEach(() => {
      invoiceService.findInvoice.mockResolvedValue({
        id: 'invoice_1',
        code: '1234',
        amount: 250,
        customerNumber: '0712345678',
      });
      transactionService.createTransaction.mockResolvedValue({
        id: 'tx_1',
        invoiceId: 'invoice_1',
      });
      cradle.initiatePayment.mockResolvedValue({
        error: false,
        reference: 'checkout_1',
      });
    });

    it('creates a transaction, sends STK push and marks invoice payment pending', async () => {
      const result = await service.initiateInvoicePayment('invoice_1');

      expect(transactionService.createTransaction).toHaveBeenCalledWith(
        'invoice_1',
      );
      expect(cradle.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 250,
          payerPhone: '254712345678',
          externalId: 'tx_1',
        }),
      );
      expect(transactionService.markAsPushed).toHaveBeenCalledWith(
        'tx_1',
        'checkout_1',
        'checkout_1',
      );
      expect(invoiceService.markPaymentPending).toHaveBeenCalledWith(
        'invoice_1',
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          invoiceId: 'invoice_1',
          transactionId: 'tx_1',
        }),
      );
    });

    it('marks the transaction failed when STK initiation fails', async () => {
      cradle.initiatePayment.mockRejectedValue(
        new ServiceUnavailableException('down'),
      );

      await expect(service.initiateInvoicePayment('invoice_1')).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(transactionService.markAsFailed).toHaveBeenCalledWith('tx_1');
    });
  });

  describe('handleInvoicePaymentCallback', () => {
    it('records settlement and sends SMS on success', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        id: 'tx_1',
        invoiceId: 'invoice_1',
        status: 'PUSHED',
        invoice: { amount: 250 },
      });

      await service.handleInvoicePaymentCallback({
        externalId: 'tx_1',
        status: 'SUCCESS',
        receipt: 'R123',
      });

      expect(ledgerService.recordSettlement).toHaveBeenCalledWith(
        'tx_1',
        'R123',
        250,
      );
      expect(smsService.sendSettlementConfirmation).toHaveBeenCalledWith(
        'invoice_1',
      );
    });

    it('records a failed transaction on failure', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        id: 'tx_1',
        invoiceId: 'invoice_1',
        status: 'PUSHED',
        invoice: { amount: 250 },
      });

      await service.handleInvoicePaymentCallback({
        externalId: 'tx_1',
        status: 'FAILED',
      });

      expect(transactionService.markAsFailed).toHaveBeenCalledWith('tx_1');
    });
  });
});
