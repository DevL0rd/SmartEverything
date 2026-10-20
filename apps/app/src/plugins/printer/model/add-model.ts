import { z } from 'zod';
import { PRINTER_ERROR_REASONS, type PrinterErrorReason } from '@smarteverything/domain';

export type AddStep = 'find' | 'name' | 'trust' | 'sign';

export const STEP_LABELS: readonly string[] = ['Find', 'Name', 'Done'];

const REASON_TEXT: Readonly<Record<PrinterErrorReason, string>> = {
  unreachable:
    'Nothing answered at that address. Check that the printer is on and on the same network as the hub.',
  wrong_path:
    'The printer answered, but not at that path. Try the address without anything after the port.',
  not_ipp: 'Something answered, but it did not speak the printing protocol (IPP).',
  not_a_printer: 'That address is not a printer.',
  needs_tls:
    'This printer only accepts encrypted connections. Use an address that starts with ipps://.',
  certificate_changed: 'The printer presented a different certificate than the one trusted before.',
  not_authenticated: 'The printer did not accept the user name and password.',
  not_authorized: 'The printer does not allow that for this account.',
  busy: 'The printer is busy. Try again in a moment.',
  format_unsupported: 'The printer cannot print that kind of file.',
  converter_missing: 'The hub has no converter for that kind of file.',
  ambiguous_file: 'More than one file has that name. Say which one to print.',
  rate_limited: 'Too many tries. Wait a minute and try again.',
};

function isReason(value: string): value is PrinterErrorReason {
  return PRINTER_ERROR_REASONS.some((reason) => reason === value);
}

export function reasonText(reason: string | null, fallback: string): string {
  return reason !== null && isReason(reason) ? REASON_TEXT[reason] : fallback;
}

export function stepIndex(step: AddStep): number {
  return step === 'find' ? 0 : 1;
}

const CERTIFICATE = z.object({
  status: z.literal('confirm_certificate'),
  fingerprint: z.string(),
  subject: z.string(),
  validFrom: z.string(),
  validTo: z.string(),
  uri: z.string(),
});

const ADDED = z.object({
  status: z.enum(['added', 'already_added']),
  printer: z.object({ ref: z.string(), name: z.string(), online: z.boolean() }),
});

const OUTCOME = z.union([CERTIFICATE, ADDED]);

export type AddOutcome = z.infer<typeof OUTCOME>;

export function outcomeOf(reply: Readonly<Record<string, unknown>>): AddOutcome | null {
  const parsed = OUTCOME.safeParse(reply);
  return parsed.success ? parsed.data : null;
}

export function nameFor(model: string | null, location: string | null): string {
  return model ?? location ?? 'Printer';
}

export class PressGate {
  private running = false;

  async run<T>(attempt: () => Promise<T>): Promise<T | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await attempt();
    } finally {
      this.running = false;
    }
  }
}
