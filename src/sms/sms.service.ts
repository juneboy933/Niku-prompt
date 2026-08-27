import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import AfricasTalking from 'africastalking';
import { InvoiceService } from 'src/invoice/invoice.service';
import { ManufacturerService } from 'src/manufacturer/manufacturer.service';
import { INVOICE_ACCEPTED_EVENT } from 'src/common/event';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly sms: ReturnType<typeof AfricasTalking>['SMS'];

  constructor(
    private readonly config: ConfigService,
    private readonly invoiceService: InvoiceService,
    private readonly manufacturerService: ManufacturerService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const at = AfricasTalking({
      username: this.config.get<string>('AT_USERNAME')!,
      apiKey: this.config.get<string>('AT_API_KEY')!,
    });
    this.sms = at.SMS;
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Convert 0712345678 or 0112345678 -> +254712345678
    if (cleaned.startsWith('0')) {
      cleaned = '+254' + cleaned.substring(1);
    }

    // Convert 254712345678 -> +254712345678
    if (cleaned.startsWith('254')) {
      cleaned = '+' + cleaned;
    }

    // Ensure it starts with +
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  // Low-level send — every outbound message goes through here
  async sendSms(to: string, message: string) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      const result = await this.sms.send({ to: [formattedPhone], message });
      this.logger.log(`SMS sent to ${to}`);
      console.log(result);
      return result;
    } catch (err) {
      // A failed SMS send shouldn't crash the caller's flow — log and move on.
      // The invoice/transaction state is still correct even if a text is lost.
      this.logger.error(`Failed to send SMS to ${to}`, err);
      return null;
    }
  }

  // ---- Message builders —----

  private buildInvoiceSentMessage(
    businessName: string,
    amount: number,
    jobDescription: string | null,
    code: string,
  ) {
    const jobPart = jobDescription ? ` for ${jobDescription}` : '';
    return `${businessName} says you owe KES ${amount}${jobPart}. Reply ${code}-1 to accept, ${code}-2 to reject.`;
  }

  private buildAcceptedCustomerMessage() {
    return 'You accepted. Check your phone to complete payment.';
  }

  private buildRejectedCustomerMessage() {
    return 'You rejected the payment request.';
  }

  private buildRejectedManufacturerMessage(
    customerNumber: string,
    code: string,
  ) {
    return `${customerNumber} rejected invoice ${code}.`;
  }

  private buildSettledCustomerMessage(amount: number, businessName: string) {
    return `Payment of KES ${amount} to ${businessName} confirmed. Thank you.`;
  }

  private buildSettledManufacturerMessage(
    amount: number,
    customerNumber: string,
    code: string,
  ) {
    return `KES ${amount} from ${customerNumber} for invoice ${code} received.`;
  }

  // Called by InvoiceModule/UssdModule right after an invoice is created —
  // sends the initial SMS and marks the invoice SENT
  async sendInvoiceCreated(invoiceId: string) {
    const invoice = await this.invoiceService.findInvoice(invoiceId);
    const manufacturer = await this.manufacturerService.findById(
      invoice.manufacturerId,
    );

    const message = this.buildInvoiceSentMessage(
      manufacturer.businessName,
      invoice.amount,
      invoice.jobDescription,
      invoice.code,
    );

    await this.sendSms(invoice.customerNumber, message);
    await this.invoiceService.markSent(invoiceId);
  }

  // Called by MpesaModule's event listener once settlement is confirmed
  async sendSettlementConfirmation(invoiceId: string) {
    const invoice = await this.invoiceService.findInvoice(invoiceId);
    const manufacturer = await this.manufacturerService.findById(
      invoice.manufacturerId,
    );

    await this.sendSms(
      invoice.customerNumber,
      this.buildSettledCustomerMessage(
        invoice.amount,
        manufacturer.businessName,
      ),
    );
    await this.sendSms(
      manufacturer.phoneNumber,
      this.buildSettledManufacturerMessage(
        invoice.amount,
        invoice.customerNumber,
        invoice.code,
      ),
    );
  }

  // ---- Inbound reply handler — POST /sms/inbound lands here ----

  async handleInboundReply(from: string, text: string) {
    const match = text.trim().match(/^(\d+)-([12])$/);

    if (!match) {
      // Not a recognizable reply — no invoice context to respond meaningfully to.
      // Silently drop rather than guessing.
      this.logger.warn(`Unrecognized SMS reply from ${from}: "${text}"`);
      return;
    }

    const [, code, choice] = match;

    let invoiceResult: Awaited<ReturnType<InvoiceService['findInvoiceByCode']>>;
    try {
      invoiceResult = await this.invoiceService.findInvoiceByCode(code);
    } catch {
      // Code doesn't exist — nothing to reply to, drop it.
      this.logger.warn(`Reply to unknown invoice code ${code} from ${from}`);
      return;
    }

    const invoice = invoiceResult.data;

    // Confirm the reply is actually coming from the invoice's customer —
    // otherwise anyone who learns a code could accept/reject someone else's invoice
    if (invoice.customerNumber !== from) {
      this.logger.warn(
        `Reply to invoice ${code} from unexpected number ${from}`,
      );
      return;
    }

    if (choice === '1') {
      try {
        await this.invoiceService.acceptInvoice(invoice.id);
      } catch (err) {
        this.logger.warn(
          `Could not accept invoice ${code} (status guard failed)`,
          err,
        );
        return;
      }

      await this.sendSms(from, this.buildAcceptedCustomerMessage());
      this.eventEmitter.emit(INVOICE_ACCEPTED_EVENT, { invoiceId: invoice.id });
    } else {
      try {
        await this.invoiceService.rejectInvoice(invoice.id);
      } catch (err) {
        this.logger.warn(
          `Could not reject invoice ${code} (status guard failed)`,
          err,
        );
        return;
      }

      const manufacturer = await this.manufacturerService.findById(
        invoice.manufacturerId,
      );

      await this.sendSms(from, this.buildRejectedCustomerMessage());
      await this.sendSms(
        manufacturer.phoneNumber,
        this.buildRejectedManufacturerMessage(invoice.customerNumber, code),
      );
    }
  }
}
