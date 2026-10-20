import { z } from 'zod';
import type { PlainObject } from './plain';
import { keyValues, maybeSet, numberOf, readSource, type DropReporter } from './schema-kit';

export type AlertSeverity = 'critical' | 'warning' | 'report';

export interface Alert {
  readonly code: string;
  readonly severity: AlertSeverity;
  readonly group: string | null;
  readonly groupIndex: number | null;
  readonly description: string | null;
  readonly time: number | null;
}

const ALERTS = z.object({
  'printer-alert': maybeSet(z.string()),
  'printer-alert-description': maybeSet(z.string()),
});

function severityOf(text: string | undefined): AlertSeverity {
  if (text === 'critical') return 'critical';
  return text === 'warning' || text === 'warningBinaryChangeEvent' ? 'warning' : 'report';
}

export function readAlerts(plain: PlainObject, report?: DropReporter): readonly Alert[] {
  const source = readSource(ALERTS, plain, report);
  return source['printer-alert'].flatMap((entry, index): readonly Alert[] => {
    const pairs = keyValues(entry);
    const code = pairs.get('code');
    if (code === undefined || code === 'other') return [];
    return [
      {
        code,
        severity: severityOf(pairs.get('severity')),
        group: pairs.get('group') ?? null,
        groupIndex: numberOf(pairs, 'groupindex'),
        description: source['printer-alert-description'][index] ?? null,
        time: numberOf(pairs, 'time'),
      },
    ];
  });
}
