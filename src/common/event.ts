export const INVOICE_ACCEPTED_EVENT = 'invoice.accepted';
export const INVOICE_SETTLED_EVENT = 'invoice.settled';
export const INVOICE_REJECTED_EVENT = 'invoice.rejected';

export interface InvoiceAcceptedPayload {
  invoiceId: string;
}

export interface InvoiceSettledPayload {
  invoiceId: string;
  mpesaReceipt: string;
}
