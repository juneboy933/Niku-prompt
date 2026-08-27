import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';

@Controller('payment')
export class PaymentsUiController {
  @Get('receipt/:invoiceNumber')
  receipt(@Param('invoiceNumber') _invoiceNumber: string, @Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'receipt.html'));
  }

  @Get('success')
  success(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'success.html'));
  }
}