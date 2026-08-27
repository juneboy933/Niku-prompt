import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { InvoiceModule } from 'src/invoice/invoice.module';

@Module({
  imports: [InvoiceModule],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
