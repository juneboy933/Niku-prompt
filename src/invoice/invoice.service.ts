import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  // normalize customer number
  private normalizeCustomerNumber(phone: string) {
    // '0712345678' , '+254712345678' -> '254712345678'
    let normalized = phone.replace(/\D/g, '');
    if (normalized.startsWith('0')) {
      normalized = '254' + normalized.slice(1);
    }

    if (!/^254[17]\d{8}$/.test(normalized)) {
      throw new BadRequestException('Invalid phone number format.');
    }

    return normalized;
  }

  // Create new invoice
  async createInvoice(
    manufacturerId: string,
    customerNumber: string,
    amount: number,
    jobDescription?: string,
  ) {
    const manufacturer = await this.prisma.manufacturer.findUnique({
      where: { id: manufacturerId },
    });

    if (!manufacturer) {
      throw new NotFoundException('Manufacturer not found');
    }

    const normalizedPhoneNumber = this.normalizeCustomerNumber(customerNumber);

    const code = Math.floor(1000 + Math.random() * 90000).toString();
    const existingCode = await this.prisma.invoice.findUnique({
      where: { code },
    });

    if (existingCode) throw new ConflictException('Code already exists');

    const result = await this.prisma.invoice.create({
      data: {
        manufacturerId,
        customerNumber: normalizedPhoneNumber,
        amount,
        jobDescription,
        code,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return {
      message: 'Invoice created successfully',
      data: result,
    };
  }

  // Find invoice
  async findInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  // Find invoice by code
  async findInvoiceByCode(code: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { code },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    return {
      data: invoice,
    };
  }

  // Mark invoice sent — only legal from CREATED
  async markSent(invoiceId: string) {
    const invoice = await this.findInvoice(invoiceId);

    if (invoice.status !== InvoiceStatus.CREATED) {
      throw new BadRequestException(
        `Cannot mark invoice as SENT from status ${invoice.status}`,
      );
    }

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.SENT },
    });
  }

  // Accept invoice — only legal from SENT
  async acceptInvoice(invoiceId: string) {
    const invoice = await this.findInvoice(invoiceId);

    if (invoice.status !== InvoiceStatus.SENT) {
      throw new BadRequestException(
        `Cannot accept invoice from status ${invoice.status}`,
      );
    }

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.ACCEPTED },
    });
  }

  // Reject invoice — only legal from SENT
  async rejectInvoice(invoiceId: string) {
    const invoice = await this.findInvoice(invoiceId);

    if (invoice.status !== InvoiceStatus.SENT) {
      throw new BadRequestException(
        `Cannot reject invoice from status ${invoice.status}`,
      );
    }

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.REJECTED },
    });
  }

  // Mark payment pending — only legal from ACCEPTED
  async markPaymentPending(invoiceId: string) {
    const invoice = await this.findInvoice(invoiceId);

    if (invoice.status !== InvoiceStatus.ACCEPTED) {
      throw new BadRequestException(
        `Cannot mark invoice as PAYMENT_PENDING from status ${invoice.status}`,
      );
    }

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.PAYMENT_PENDING },
    });
  }

  // Settle invoice — only legal from PAYMENT_PENDING
  // IMPORTANT: this must only ever be called by LedgerService, as a side
  // effect of writing a Ledger entry — never called directly from
  // ussd/sms/mpesa. Ledger is the source of truth for settlement.
  async settleInvoice(
    invoiceId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const invoice = await this.findInvoice(invoiceId);

    if (invoice.status !== InvoiceStatus.PAYMENT_PENDING) {
      throw new BadRequestException(
        `Cannot settle invoice from status ${invoice.status}`,
      );
    }

    return tx.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.SETTLED },
    });
  }
}
