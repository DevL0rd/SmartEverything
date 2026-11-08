import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { hubLayout, writeMarker, type HubLayout } from '../../src/data-layout';

export async function testLayout(
  temporaryRoot: string,
  rootId: string = randomUUID(),
): Promise<HubLayout> {
  await mkdir(temporaryRoot, { recursive: true });
  const layout = hubLayout(temporaryRoot, {});
  await writeMarker(layout, {
    version: 1,
    rootId,
    createdAt: new Date().toISOString(),
    state: 'active',
  });
  return layout;
}
