import { Injectable } from '@nestjs/common';
import { InvoiceService } from 'src/invoice/invoice.service';
import { TransactionService } from 'src/transaction/transaction.service';

@Injectable()
export class LedgerService {
  constructor(
    private readonly invoice: InvoiceService,
    private readonly transaction: TransactionService,
  ) {}

  //   Record settlement
}
