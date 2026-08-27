import { Module } from '@nestjs/common';
import {
  CRADLE_PAYMENT_CONFIG,
  cradlePaymentConfig,
} from 'src/config/cradle-payment.config';
import { InvoiceModule } from 'src/invoice/invoice.module';
import { LedgerModule } from 'src/ledger/ledger.module';
import { SmsModule } from 'src/sms/sms.module';
import { TransactionModule } from 'src/transaction/transaction.module';
import { CradleAuthService } from './cradle/cradle-auth.service';
import { CradlePaymentService } from './cradle/cradle-payment.service';
import { PaymentsController } from './payments.controller';
import { PaymentsUiController } from './payments-ui.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [InvoiceModule, LedgerModule, SmsModule, TransactionModule],
  controllers: [PaymentsController, PaymentsUiController],
  providers: [
    PaymentsService,
    CradleAuthService,
    CradlePaymentService,
    { provide: CRADLE_PAYMENT_CONFIG, useFactory: cradlePaymentConfig },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
