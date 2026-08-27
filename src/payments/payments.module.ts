import { Module } from '@nestjs/common';
import {
  CRADLE_PAYMENT_CONFIG,
  cradlePaymentConfig,
} from 'src/config/cradle-payment.config';
import { CradleAuthService } from './cradle/cradle-auth.service';
import { CradlePaymentService } from './cradle/cradle-payment.service';
import { PaymentsController } from './payments.controller';
import { PaymentsUiController } from './payments-ui.controller';
import { PaymentsService } from './payments.service';

@Module({
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