import type { BottleSyncUpload } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { BottleEntryConfig } from './config';
import type { Decoded } from './decode';
import { currentQuiet, currentReminder, mergedQuiet, mergedReminder, type PlanDeps } from './plan';

export interface WriteContext {
  readonly deps: Pick<PlanDeps, 'snapshots'> & { readonly log: Logger };
  readonly deviceId: string;
  readonly config: BottleEntryConfig;
  readonly upload: BottleSyncUpload;
  readonly decoded: Decoded;
}

interface Bases {
  readonly reminder: ReturnType<typeof currentReminder>;
  readonly quiet: ReturnType<typeof currentQuiet>;
}

export function basesOf(deps: Pick<PlanDeps, 'snapshots'>, deviceId: string): Bases {
  return { reminder: currentReminder(deps, deviceId), quiet: currentQuiet(deps, deviceId) };
}

function written(context: WriteContext, write: string, readBack: string): boolean {
  return (
    context.decoded.answered.has(readBack) &&
    context.upload.responses.some((response) => response.name === write)
  );
}

function confirm(context: WriteContext, setting: string, expected: object, found: object): void {
  if (JSON.stringify(expected) !== JSON.stringify(found)) {
    context.deps.log.warn('bottle.write_not_confirmed', {
      device: context.deviceId,
      setting,
      expected: JSON.stringify(expected),
      found: JSON.stringify(found),
    });
  }
}

export function settledWrites(context: WriteContext, bases: Bases): BottleEntryConfig['desired'] {
  const { desired } = context.config;
  const reminderDone = desired.reminder !== null && written(context, 'set_reminder', 'reminder');
  const quietDone = desired.quiet !== null && written(context, 'set_quiet', 'quiet');
  if (reminderDone && desired.reminder !== null) {
    confirm(
      context,
      'reminder',
      mergedReminder(bases.reminder, desired.reminder),
      currentReminder(context.deps, context.deviceId),
    );
  }
  if (quietDone && desired.quiet !== null) {
    confirm(
      context,
      'quiet',
      mergedQuiet(bases.quiet, desired.quiet),
      currentQuiet(context.deps, context.deviceId),
    );
  }
  return {
    reminder: reminderDone ? null : desired.reminder,
    quiet: quietDone ? null : desired.quiet,
  };
}

export function rememberedUnsupported(context: WriteContext): BottleEntryConfig['unsupported'] {
  const { config, upload, decoded } = context;
  const firmware = upload.dis?.firmware ?? config.unsupported.firmware;
  const kept = firmware === config.unsupported.firmware ? config.unsupported.requests : [];
  return { firmware, requests: [...new Set([...kept, ...decoded.unsupported])] };
}
