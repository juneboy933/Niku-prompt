import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceService } from 'src/invoice/invoice.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { LedgerService } from './ledger.service';

describe('LedgerService', () => {
  let service: LedgerService;
  const invoiceService = { settleInvoice: jest.fn() };
  const prismaService = { $transaction: jest.fn() };
  const transactionService = { markAsSuccess: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        { provide: InvoiceService, useValue: invoiceService },
        { provide: PrismaService, useValue: prismaService },
        { provide: TransactionService, useValue: transactionService },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
