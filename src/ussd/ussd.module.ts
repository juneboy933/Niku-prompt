import { Module } from '@nestjs/common';
import { UssdService } from './ussd.service';
import { UssdController } from './ussd.controller';
import { ManufacturerModule } from 'src/manufacturer/manufacturer.module';
import { InvoiceModule } from 'src/invoice/invoice.module';
import { SmsModule } from 'src/sms/sms.module';

@Module({
  imports: [ManufacturerModule, InvoiceModule, SmsModule],
  controllers: [UssdController],
  providers: [UssdService],
})
export class UssdModule {}
