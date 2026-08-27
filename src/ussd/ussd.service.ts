import { Injectable, Logger } from '@nestjs/common';
import { ManufacturerService } from 'src/manufacturer/manufacturer.service';
import { InvoiceService } from 'src/invoice/invoice.service';
import { SmsService } from 'src/sms/sms.service';
import { normalizeCustomerNumber } from 'src/common/phone';

@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);

  constructor(
    private readonly manufacturerService: ManufacturerService,
    private readonly invoiceService: InvoiceService,
    private readonly smsService: SmsService,
  ) {}

  async handleSession(rawPhoneNumber: string, text: string): Promise<string> {
    const phoneNumber = normalizeCustomerNumber(rawPhoneNumber);
    const parts = text === '' ? [] : text.split('*');
    const manufacturer =
      await this.manufacturerService.findByPhone(phoneNumber);

    if (!manufacturer) {
      return this.handleUnregistered(phoneNumber, parts);
    }
    return this.handleRegistered(manufacturer.id, parts);
  }

  private async handleUnregistered(
    phoneNumber: string,
    parts: string[],
  ): Promise<string> {
    if (parts.length === 0) {
      return 'CON Niku-Prompt?\n1. Register\n2. Ask for payment';
    }

    if (parts[0] === '2') {
      return 'END Please register first.';
    }

    if (parts[0] === '1') {
      if (parts.length === 1) {
        return 'CON Enter your business name';
      }
      if (parts.length === 2) {
        const businessName = parts[1].trim();
        if (!businessName) {
          return 'END Business name cannot be empty. Please try again.';
        }
        try {
          await this.manufacturerService.createManufacturer(
            phoneNumber,
            businessName,
          );
        } catch (err) {
          this.logger.error('Registration failed', err);
          return 'END Registration failed. Please try again.';
        }
        return 'END Registration successful! Dial in again to send a payment request.';
      }
    }

    return 'END Invalid option.';
  }

  private async handleRegistered(
    manufacturerId: string,
    parts: string[],
  ): Promise<string> {
    if (parts.length === 0) {
      return 'CON Niku-Prompt?\n1. Ask for payment';
    }

    if (parts[0] !== '1') {
      return 'END Invalid option.';
    }

    if (parts.length === 1) {
      return 'CON Enter customer phone number';
    }

    if (parts.length === 2) {
      return 'CON Enter amount (KES)';
    }

    if (parts.length === 3) {
      const amount = Number(parts[2]);
      if (!Number.isFinite(amount) || amount <= 0) {
        return 'END Invalid amount. Please try again.';
      }
      return `CON Invoice ${parts[1]} for KES ${amount}.\n1. Confirm\n2. Cancel`;
    }

    if (parts.length === 4) {
      if (parts[3] === '2') {
        return 'END Invoice cancelled.';
      }
      if (parts[3] !== '1') {
        return 'END Invalid option.';
      }

      const customerNumberRaw = parts[1];
      const amount = Number(parts[2]);

      try {
        const invoice = await this.invoiceService.createInvoice(
          manufacturerId,
          customerNumberRaw,
          amount,
        );
        await this.smsService.sendInvoiceCreated(invoice.data.id);
      } catch (err) {
        this.logger.error('Invoice creation failed', err);
        return 'END Could not create invoice. Please check the number and try again.';
      }

      return 'END Invoice sent! You will be notified once payment is confirmed.';
    }

    return 'END Invalid option.';
  }
}
