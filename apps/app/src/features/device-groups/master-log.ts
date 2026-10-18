import { Logger } from '@smarteverything/logging';
import { errorFields } from '../../design/log-tally';

const log = new Logger('app.device-groups');

export interface MasterCommandFields {
  readonly targetKind: string;
  readonly capability: string;
  readonly scope: string | null;
  readonly members: number;
  readonly report: boolean;
}

export function logCommandStarted(fields: MasterCommandFields): void {
  if (fields.report) log.debug('master_command.started', () => ({ ...fields }));
  else log.trace('master_command.started', () => ({ ...fields }));
}

export function logCommandAccepted(
  fields: MasterCommandFields,
  counts: { readonly commands: number; readonly skipped: number },
  startedAt: number,
): void {
  log.debug('master_command.accepted', () => ({
    ...fields,
    ...counts,
    durationMs: Date.now() - startedAt,
  }));
}

export function logCommandSettled(
  fields: MasterCommandFields,
  counts: { readonly commands: number; readonly failedCommands: number; readonly issues: number },
  startedAt: number,
): void {
  log.info('master_command.settled', { ...fields, ...counts, durationMs: Date.now() - startedAt });
}

export function logCommandFailed(
  fields: MasterCommandFields,
  error: unknown,
  startedAt: number,
): void {
  log.warn('master_command.failed', {
    ...fields,
    durationMs: Date.now() - startedAt,
    ...errorFields(error),
  });
}

export function commandFields(
  targetKind: string,
  change: { readonly capability: string; readonly scope?: string | undefined },
  members: number,
  report: boolean,
): MasterCommandFields {
  return {
    targetKind,
    capability: change.capability,
    scope: change.scope ?? null,
    members,
    report,
  };
}
