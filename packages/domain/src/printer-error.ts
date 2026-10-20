export const PRINTER_ERROR_REASONS = [
  'unreachable',
  'wrong_path',
  'not_ipp',
  'not_a_printer',
  'needs_tls',
  'certificate_changed',
  'not_authenticated',
  'not_authorized',
  'busy',
  'format_unsupported',
  'converter_missing',
  'ambiguous_file',
  'rate_limited',
] as const;

export type PrinterErrorReason = (typeof PRINTER_ERROR_REASONS)[number];

export class PrinterError extends Error {
  override readonly name = 'PrinterError';

  constructor(
    readonly reason: PrinterErrorReason,
    message: string,
    readonly fields: Readonly<Record<string, string | number | boolean | null>> = {},
  ) {
    super(message);
  }
}
