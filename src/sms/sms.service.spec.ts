import { Test, TestingModule } from '@nestjs/testing';
import { SmsService } from './sms.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvoiceService } from 'src/invoice/invoice.service';
import { ManufacturerService } from 'src/manufacturer/manufacturer.service';

describe('SmsService', () => {
  let service: SmsService;
  const configService = {
    get: jest.fn((key: string) => key),
  };
  const eventEmitter = {
    emit: jest.fn(),
  };
  const invoiceService = {};
  const manufacturerService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: ConfigService, useValue: configService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: InvoiceService, useValue: invoiceService },
        { provide: ManufacturerService, useValue: manufacturerService },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
