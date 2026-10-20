import type { CommandRow } from '@smarteverything/domain';
import type { EffectRun } from './effect-run';

export const COMMAND_METADATA_LIFETIME_MS = 2 * 60_000;

export interface CommandStamp {
  readonly nodePath: string | null;
  readonly iteration: number;
  readonly attempt: number;
}

export interface CommandMetadata extends CommandStamp {
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly causeRunId: string;
  readonly causeAutomationId: string;
  readonly causeDepth: number;
}

interface Entry {
  readonly metadata: CommandMetadata;
  readonly at: number;
}

const FIRST_ATTEMPT: Pick<CommandStamp, 'iteration' | 'attempt'> = {
  iteration: 0,
  attempt: 1,
};

export function stampOf(nodePath: string | null): CommandStamp {
  return { nodePath, ...FIRST_ATTEMPT };
}

function depthOf(trigger: EffectRun['trigger']): number {
  const depth = trigger?.data['causeDepth'];
  return typeof depth === 'number' && Number.isInteger(depth) && depth >= 0 ? depth : 0;
}

export function metadataOf(run: EffectRun, stamp: CommandStamp): CommandMetadata {
  return {
    ...stamp,
    runId: run.runId,
    idempotencyKey: JSON.stringify([run.runId, stamp.nodePath, stamp.iteration, stamp.attempt]),
    causeRunId: run.runId,
    causeAutomationId: run.automationId,
    causeDepth: depthOf(run.trigger) + 1,
  };
}

export class CommandMetadataLog {
  private readonly entries = new Map<string, Entry>();

  stamp(rows: readonly CommandRow[], metadata: CommandMetadata, now: number): void {
    this.forget(now);
    for (const row of rows) this.entries.set(row.id, { metadata, at: now });
  }

  of(commandId: string, now: number): CommandMetadata | undefined {
    const entry = this.entries.get(commandId);
    return entry === undefined || now - entry.at >= COMMAND_METADATA_LIFETIME_MS
      ? undefined
      : entry.metadata;
  }

  private forget(now: number): void {
    for (const [id, entry] of this.entries) {
      if (now - entry.at < COMMAND_METADATA_LIFETIME_MS) return;
      this.entries.delete(id);
    }
  }
}

const LOGS = new WeakMap<object, CommandMetadataLog>();

export function commandMetadata(store: object): CommandMetadataLog {
  const known = LOGS.get(store);
  if (known !== undefined) return known;
  const created = new CommandMetadataLog();
  LOGS.set(store, created);
  return created;
}
