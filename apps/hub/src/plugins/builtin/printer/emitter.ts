import type { PluginEvent } from '@smarteverything/domain';
import type { PrinterLedger } from './ledger';
import type { CapName, RateGuard } from './rate-guard';

export const EVENT_KINDS = [
  'job_started',
  'job_finished',
  'problem_added',
  'problem_cleared',
  'alert',
  'supply_low',
  'supply_empty',
  'supply_replaced',
  'restarted',
  'config_changed',
  'pairing_problem',
  'offline_long',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export type EventData = Readonly<Record<string, string | number | boolean>>;

export interface EmitRequest {
  readonly kind: EventKind;
  readonly text: string;
  readonly data: EventData;
  readonly cap: CapName;
  readonly subject?: string;
}

export interface EmitterDeps {
  readonly guard: RateGuard;
  readonly ledger: PrinterLedger;
  readonly send: (event: PluginEvent) => void;
  readonly now: () => Date;
  readonly printer: () => { readonly id: string; readonly name: string };
}

export class PrinterEmitter {
  constructor(private readonly deps: EmitterDeps) {}

  emit(request: EmitRequest): boolean {
    if (!this.deps.guard.allow(request.cap, request.subject ?? request.kind)) return false;
    const { id, name } = this.deps.printer();
    this.deps.ledger.note(request.kind, request.text, this.deps.now());
    this.deps.send({
      kind: request.kind,
      subject: request.text,
      data: { ...request.data, printer: name, printer_id: id },
    });
    return true;
  }
}
