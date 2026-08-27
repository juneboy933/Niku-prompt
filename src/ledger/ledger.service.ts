import { Injectable } from '@nestjs/common';
import { InvoiceService } from 'src/invoice/invoice.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { TransactionService } from 'src/transaction/transaction.service';

@Injectable()
export class LedgerService {
  constructor(
    private readonly invoice: InvoiceService,
    private readonly transaction: TransactionService,
    private readonly prisma: PrismaService,
  ) {}

  // Record settlement
  async recordSettlement(
    transactionId: string,
    mpesaReceipt: string,
    amount: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await this.transaction.markAsSuccess(
        transactionId,
        tx,
      );
      const ledgerEntry = await tx.ledger.create({
        data: { transactionId: transaction.id, mpesaReceipt, amount },
      });

      await this.invoice.settleInvoice(transaction.invoiceId, tx);

      return {
        message: 'Ledger recorded successfully',
        data: ledgerEntry,
      };
    });
  }
}
