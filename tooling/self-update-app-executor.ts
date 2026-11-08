import { createHash } from 'node:crypto';
import type { AppPublicationInput, AppUpdateEntry } from '@smarteverything/domain';

export function desktopPublicationId(runId: string): string {
  const hash = createHash('sha256')
    .update(JSON.stringify([runId, 'desktop']))
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

interface UiPublicationPorts {
  readonly entries: () => Promise<readonly Pick<AppUpdateEntry, 'id'>[]>;
  readonly android: () => Promise<unknown>;
  readonly desktop: (id: string) => Promise<unknown>;
}

export async function executeUiPublication(
  input: AppPublicationInput,
  ports: UiPublicationPorts,
): Promise<void> {
  const entries = await ports.entries();
  if (!entries.some((entry) => entry.id === input.runId)) await ports.android();
  const desktopId = desktopPublicationId(input.runId);
  if (!entries.some((entry) => entry.id === desktopId)) await ports.desktop(desktopId);
}
