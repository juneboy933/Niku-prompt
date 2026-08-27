import { Test, TestingModule } from '@nestjs/testing';
import { UssdService } from './ussd.service';
import { InvoiceService } from 'src/invoice/invoice.service';
import { ManufacturerService } from 'src/manufacturer/manufacturer.service';
import { SmsService } from 'src/sms/sms.service';

describe('UssdService', () => {
  let service: UssdService;
  const invoiceService = {};
  const manufacturerService = {};
  const smsService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UssdService,
        { provide: InvoiceService, useValue: invoiceService },
        { provide: ManufacturerService, useValue: manufacturerService },
        { provide: SmsService, useValue: smsService },
      ],
    }).compile();

    service = module.get<UssdService>(UssdService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
