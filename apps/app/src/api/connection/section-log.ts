import { Logger } from '@smarteverything/logging';
import type { SectionFailure } from './readable';

const log = new Logger('app.api');

const reportedSections = new Set<string>();
const warnedFields = new Set<string>();

export function noteNewerFields(route: string, ignored: readonly string[]): void {
  for (const path of ignored) {
    const parts = path.split('.').filter((part) => !/^\d+$/.test(part));
    const key = `${route}|${parts.join('.')}`;
    if (warnedFields.has(key)) continue;
    warnedFields.add(key);
    log.warn('api.newer_field_ignored', {
      route,
      table: parts.slice(0, 2).join('.'),
      field: parts.slice(2).join('.'),
    });
  }
}

export function noteFailed(route: string, failed: readonly SectionFailure[]): void {
  for (const failure of failed) {
    const key = `${route}|${failure.section}|${failure.reason}`;
    if (reportedSections.has(key)) continue;
    reportedSections.add(key);
    log.error('api.section_failed', new Error(`${failure.section}: ${failure.reason}`), {
      route,
      section: failure.section,
      reason: failure.reason,
    });
  }
}
