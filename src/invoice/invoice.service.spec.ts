import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { InvoiceService } from './invoice.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('InvoiceService', () => {
  let service: InvoiceService;
  const prismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        {
          provide: PrismaService,
          useValue: {
            manufacturer: { findUnique: jest.fn() },
            invoice: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
