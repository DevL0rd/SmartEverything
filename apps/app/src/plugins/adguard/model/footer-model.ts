import type { AdGuardSnapshot } from '@smarteverything/domain';
import { decimal } from '../../../format/number';
import { joinParts } from '../../../format/text';

function cadenceText(snapshot: AdGuardSnapshot): string | null {
  if (snapshot.connection.state !== 'online' || snapshot.intervalSeconds === null) {
    return null;
  }
  const seconds = decimal(snapshot.intervalSeconds);
  return snapshot.cadence === 'fast'
    ? `Updates every ${seconds} s while you’re looking.`
    : `Updates every ${seconds} s in the background.`;
}

export function footerText(snapshot: AdGuardSnapshot): string {
  const version = snapshot.status?.version ?? null;
  return joinParts([
    version === null ? 'AdGuard Home' : `AdGuard Home ${version}`,
    cadenceText(snapshot),
  ]);
}
