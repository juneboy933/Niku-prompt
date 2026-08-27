import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ManufacturerService } from './manufacturer.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('ManufacturerService', () => {
  let service: ManufacturerService;
  const prismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManufacturerService,
        {
          provide: PrismaService,
          useValue: {
            manufacturer: { findUnique: jest.fn(), create: jest.fn() },
          },
        },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<ManufacturerService>(ManufacturerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
