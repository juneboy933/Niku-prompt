import { Test, TestingModule } from '@nestjs/testing';
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
