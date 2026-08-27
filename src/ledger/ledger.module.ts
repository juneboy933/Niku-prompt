import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { InvoiceModule } from 'src/invoice/invoice.module';
import { TransactionModule } from 'src/transaction/transaction.module';

@Module({
  imports: [InvoiceModule, TransactionModule],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
