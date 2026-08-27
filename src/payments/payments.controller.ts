import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('initiate')
  initiate(@Body() dto: InitiatePaymentDto) {
    return this.payments.initiatePayment(dto);
  }

  @Get(':invoiceNumber')
  status(@Param('invoiceNumber') invoiceNumber: string) {
    return this.payments.findByInvoiceNumber(invoiceNumber);
  }

  @Post('cradle/callback')
  callback(@Body() payload: unknown) {
    return this.payments.handleCradleCallback(payload);
  }
}