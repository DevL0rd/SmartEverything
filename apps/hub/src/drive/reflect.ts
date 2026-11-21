import { messageOf } from '@smarteverything/logging';
import type { StoredDrive } from '../store/repositories/drive-roots';
import {
  hashForReuse,
  scanHandler,
  ScanRun,
  type DriveJobHandlers,
  type ScanEnvironment,
} from './jobs';
import { withScan, type ScanSession } from './scan-session';

async function commitScopes(
  env: ScanEnvironment,
  root: StoredDrive,
  session: ScanSession,
  signal: AbortSignal,
): Promise<boolean> {
  const unreadable: string[] = [];
  for (const base of session.scoped) {
    const outcome = await new ScanRun(env, root, session, { base, full: false }).walk(signal);
    if (outcome.cancelled) return false;
    unreadable.push(...outcome.unreadable);
  }
  await session.finish(unreadable, (entry) => hashForReuse(env, root, entry));
  return true;
}

async function reflectPaths(
  env: ScanEnvironment,
  root: StoredDrive,
  paths: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  const startedAt = performance.now();
  await env.lanes.run([root.id], () =>
    withScan(env.scans, root.id, paths, async (session) => {
      const finished = await commitScopes(env, root, session, signal);
      env.log.info(finished ? 'drive.reflect_done' : 'drive.reflect_cancelled', {
        rootId: root.id,
        paths: paths.length,
        scopes: session.scoped.length,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }),
  );
}

export function reflectHandler(env: ScanEnvironment): DriveJobHandlers['reflect'] {
  const scan = scanHandler(env);
  return async (job, signal) => {
    if (job.paths.includes('')) {
      await scan({ kind: 'scan', rootId: job.rootId }, signal);
      return;
    }
    const root = await env.scans.root(job.rootId);
    if (root === undefined) {
      env.log.warn('drive.reflect_skipped', { rootId: job.rootId, reason: 'no such drive' });
      return;
    }
    if ((await env.availability(root)) !== 'online') {
      await scan({ kind: 'scan', rootId: job.rootId }, signal);
      return;
    }
    try {
      await reflectPaths(env, root, job.paths, signal);
    } catch (cause) {
      env.log.error('drive.reflect_failed', cause, { rootId: job.rootId });
      await env.scans.update(job.rootId, { state: 'error', stateReason: messageOf(cause) });
    }
  };
}
