import { Test, TestingModule } from '@nestjs/testing';
import { ManufacturerService } from './manufacturer.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('ManufacturerService', () => {
  let service: ManufacturerService;
  const prismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManufacturerService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<ManufacturerService>(ManufacturerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
