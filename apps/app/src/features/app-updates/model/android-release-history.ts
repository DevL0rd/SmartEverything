import { z } from 'zod';

const EMBEDDED_RELEASE = z.object({ id: z.uuid(), commitTime: z.int().nonnegative() });

export function embeddedReleaseDate(manifest: unknown, runningId: string): string | undefined {
  const parsed = EMBEDDED_RELEASE.safeParse(manifest);
  if (!parsed.success || parsed.data.id !== runningId) return undefined;
  const created = new Date(parsed.data.commitTime);
  return Number.isFinite(created.getTime()) ? created.toISOString() : undefined;
}
