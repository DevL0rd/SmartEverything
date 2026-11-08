import { z } from 'zod';

const PLAN_COMMAND = 'plan';
const PLAN_OFF = 'off';

const EVENT = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('command/run'),
    data: z.object({
      commandId: z.string(),
      name: z.string(),
      args: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('command/done'),
    data: z.object({ commandId: z.string(), kind: z.enum(['success', 'error']) }),
  }),
  z.object({ type: z.literal('plan/mode'), data: z.object({ active: z.boolean() }) }),
]);

export interface PlanView {
  readonly active: boolean;
  readonly pending: boolean;
}

interface Running {
  readonly commandId: string;
  readonly wanted: boolean;
}

export class PlanTracker {
  private active = false;
  private wanted: boolean | null = null;
  private running: Running | null = null;

  view(): PlanView {
    const wanted = this.running?.wanted ?? this.wanted;
    return { active: this.active, pending: wanted !== null && wanted !== this.active };
  }

  record(raw: unknown): boolean {
    const parsed = EVENT.safeParse(raw);
    if (!parsed.success) return false;
    const before = this.view();
    this.fold(parsed.data);
    const after = this.view();
    return before.active !== after.active || before.pending !== after.pending;
  }

  private fold(event: z.infer<typeof EVENT>): void {
    switch (event.type) {
      case 'command/run':
        if (event.data.name === PLAN_COMMAND && event.data.args !== undefined)
          this.running = {
            commandId: event.data.commandId,
            wanted: event.data.args.trim() !== PLAN_OFF,
          };
        return;
      case 'command/done':
        if (this.running?.commandId !== event.data.commandId) return;
        this.wanted =
          event.data.kind === 'success' && this.running.wanted !== this.active
            ? this.running.wanted
            : null;
        this.running = null;
        return;
      case 'plan/mode':
        this.active = event.data.active;
        this.wanted = null;
        return;
    }
  }
}
