import { buildInvoiceNumber, parseInvoiceSequence } from './invoice.util';

describe('buildInvoiceNumber', () => {
  it('formats a sequential invoice number', () => {
    expect(buildInvoiceNumber(1, 2026)).toBe('INV-2026-000001');
    expect(buildInvoiceNumber(12, 2026)).toBe('INV-2026-000012');
    expect(buildInvoiceNumber(123456, 2026)).toBe('INV-2026-123456');
  });

  it('defaults to the current year', () => {
    expect(buildInvoiceNumber(2)).toBe(
      `INV-${new Date().getFullYear()}-000002`,
    );
  });
});

describe('parseInvoiceSequence', () => {
  it('parses the sequence from an invoice number', () => {
    expect(parseInvoiceSequence('INV-2026-000007', 2026)).toBe(7);
    expect(parseInvoiceSequence('INV-2025-000001', 2026)).toBeNull();
    expect(parseInvoiceSequence('INV-2026-000000', 2026)).toBeNull();
    expect(parseInvoiceSequence('INV-2026-abc', 2026)).toBeNull();
  });
});