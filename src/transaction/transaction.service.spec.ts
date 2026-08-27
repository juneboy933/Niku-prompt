import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceService } from 'src/invoice/invoice.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { TransactionService } from './transaction.service';
import { InvoiceService } from 'src/invoice/invoice.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('TransactionService', () => {
  let service: TransactionService;
  const invoiceService = {};
  const prismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: InvoiceService, useValue: { findInvoice: jest.fn() } },
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        { provide: InvoiceService, useValue: invoiceService },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
