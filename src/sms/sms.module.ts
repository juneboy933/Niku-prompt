import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { InvoiceModule } from 'src/invoice/invoice.module';
import { ManufacturerModule } from 'src/manufacturer/manufacturer.module';

@Module({
  imports: [InvoiceModule, ManufacturerModule],
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
