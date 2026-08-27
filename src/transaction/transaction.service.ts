import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionStatus } from '@prisma/client';
import { InvoiceService } from 'src/invoice/invoice.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoice: InvoiceService,
  ) {}

  // Create transaction — refuses if the invoice already has a SUCCESS
  // transaction (already paid, don't push again)
  async createTransaction(invoiceId: string) {
    const invoice = await this.invoice.findInvoice(invoiceId);

    const existingSuccess = await this.prisma.transaction.findFirst({
      where: { invoiceId: invoice.id, status: TransactionStatus.SUCCESS },
    });

    if (existingSuccess) {
      throw new ConflictException(
        'Invoice already has a successful transaction',
      );
    }

    return this.prisma.transaction.create({
      data: { invoiceId: invoice.id },
    });
  }

  // Find transaction by Id
  async findTransactionById(
    transactionId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const transaction = await tx.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  // Mark as pushed
  async markAsPushed(
    transactionId: string,
    checkoutRequestId: string,
    merchantRequestId: string,
  ) {
    const transaction = await this.findTransactionById(transactionId);
    if (transaction.status !== TransactionStatus.INITIATED) {
      throw new BadRequestException(
        `Cannot mark transaction as PUSHED from status ${transaction.status}`,
      );
    }

    return this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.PUSHED,
        checkoutRequestId,
        merchantRequestId,
      },
    });
  }

  // Find by checkout request id
  async findByCheckoutRequestId(checkoutRequestId: string) {
    return this.prisma.transaction.findUnique({
      where: { checkoutRequestId },
    });
  }

  // Mark as success — the only legal predecessor is PUSHED.
  // IMPORTANT: only LedgerService should call this, right before it writes
  // its entry. Never call this directly from a callback/poll handler alone.
  async markAsSuccess(
    transactionId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const transaction = await this.findTransactionById(transactionId, tx);
    if (transaction.status !== TransactionStatus.PUSHED) {
      throw new BadRequestException(
        `Cannot mark transaction as SUCCESS from ${transaction.status}`,
      );
    }
    return tx.transaction.update({
      where: { id: transactionId },
      data: { status: TransactionStatus.SUCCESS },
    });
  }

  // Mark as failed
  async markAsFailed(transactionId: string) {
    const transaction = await this.findTransactionById(transactionId);
    if (transaction.status !== TransactionStatus.PUSHED) {
      throw new BadRequestException(
        `Cannot mark transaction as FAILED from ${transaction.status}`,
      );
    }
    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: TransactionStatus.FAILED },
    });
  }

  // Mark as unknown
  async markAsUnknown(transactionId: string) {
    const transaction = await this.findTransactionById(transactionId);
    if (transaction.status !== TransactionStatus.PUSHED) {
      throw new BadRequestException(
        `Cannot mark transaction as UNKNOWN from ${transaction.status}`,
      );
    }
    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: TransactionStatus.UNKNOWN },
    });
  }

  // Increment poll attempt
  async incrementPollAttempt(transactionId: string) {
    const transaction = await this.findTransactionById(transactionId);
    return this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { pollAttempts: { increment: 1 } },
    });
  }
}
