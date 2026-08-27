export function buildInvoiceNumber(
  sequence: number,
  year: number = new Date().getFullYear(),
): string {
  return `INV-${year}-${String(sequence).padStart(6, '0')}`;
}

export function parseInvoiceSequence(
  invoiceNumber: string,
  year: number = new Date().getFullYear(),
): number | null {
  const prefix = `INV-${year}-`;
  if (!invoiceNumber.startsWith(prefix)) {
    return null;
  }
  const sequence = Number(invoiceNumber.slice(prefix.length));
  return Number.isInteger(sequence) && sequence > 0 ? sequence : null;
}