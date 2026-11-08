import { createHash } from 'node:crypto';
import { signatureText } from '@smarteverything/logging';
import { z } from 'zod';
import type { LogFailure, StoredLogRecord } from './runtime-log-types';

const HUB_FATAL_EVENT = 'service.fatal';
const HUB_SERVICE_SCOPE = 'hub.service';
const HUB_SERVICE_SOURCE = 'hub:service';

const FRAME_NAME = /^\s*at ([\w.$<>]+) \(/mu;

export const REPAIR_CATEGORY = z.enum([
  'hub service failed',
  'camera service exited',
  'plugin process crashed',
  'computer AI could not start',
  'desktop app failed',
  'app had an uncaught exception',
  'AI session failed',
  'unhandled promise rejection',
  'unclassified error',
]);

type Category = z.infer<typeof REPAIR_CATEGORY>;

const FAILURE_CATEGORIES: ReadonlyMap<string, readonly [string, string, Category]> = new Map([
  ['session.failed', ['hub.harness', HUB_SERVICE_SOURCE, 'AI session failed']],
  ['promise.unhandled', [HUB_SERVICE_SCOPE, HUB_SERVICE_SOURCE, 'unhandled promise rejection']],
  [HUB_FATAL_EVENT, [HUB_SERVICE_SCOPE, HUB_SERVICE_SOURCE, 'hub service failed']],
  ['go2rtc.died', ['hub.go2rtc', 'hub:service', 'camera service exited']],
  ['plugin.crashed', ['hub.plugins', 'plugin:', 'plugin process crashed']],
  ['harness.compose_failed', ['hub.node-harness', 'node:', 'computer AI could not start']],
  ['desktop.failed', ['desktop.main', 'desktop:', 'desktop app failed']],
  ['error.uncaught', ['app.crash-guard', 'app:', 'app had an uncaught exception']],
]);

type EventSource = Pick<StoredLogRecord, 'event' | 'scope' | 'source'> & {
  readonly failure: { readonly name: string } | null;
};

export function isHubServiceFatal(
  record: Pick<EventSource, 'event' | 'scope' | 'source'>,
): boolean {
  return (
    record.event === HUB_FATAL_EVENT &&
    record.scope === HUB_SERVICE_SCOPE &&
    record.source === HUB_SERVICE_SOURCE
  );
}

export function repairCategory(record: EventSource): Category {
  const registration = FAILURE_CATEGORIES.get(record.event);
  if (registration === undefined || record.failure === null) return 'unclassified error';
  const [scope, source, category] = registration;
  const matches = source.endsWith(':')
    ? record.source.startsWith(source)
    : record.source === source;
  return record.scope === scope && matches ? category : 'unclassified error';
}

function classifiedFailure(record: StoredLogRecord): boolean {
  return repairCategory(record) !== 'unclassified error';
}

export function repairComponent(record: Pick<StoredLogRecord, 'source' | 'scope'>): string {
  return record.source.startsWith('plugin:') ? record.source : record.scope;
}

function failureParts(failure: LogFailure | null): readonly string[] {
  return failure === null
    ? []
    : [
        signatureText(failure.name),
        signatureText(failure.message),
        FRAME_NAME.exec(failure.stack ?? '')?.[1] ?? '',
      ];
}

function distinctSource(source: string, component: string, automatic: boolean): readonly string[] {
  return automatic && source !== 'hub:service' && component !== source ? [source] : [];
}

export function repairObservation(
  record: StoredLogRecord,
): { readonly fingerprint: string; readonly component: string } | null {
  if (record.level !== 'error' && record.level !== 'exception') return null;
  const component = repairComponent(record);
  const runId = isHubServiceFatal(record) ? record.hubBootRunId : undefined;
  const automatic = classifiedFailure(record);
  const release = automatic ? (runId ?? record.release) : undefined;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        'repair-v1',
        component,
        record.event,
        ...distinctSource(record.source, component, automatic),
        ...failureParts(record.failure),
        ...(release === undefined ? [] : [release]),
      ]),
    )
    .digest('hex');
  return { fingerprint, component };
}
