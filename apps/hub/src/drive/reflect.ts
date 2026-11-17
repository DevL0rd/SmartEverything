import { messageOf } from '@smarteverything/logging';
import type { StoredDrive } from '../store/repositories/drive-roots';
import {
  commitDependencies,
  scanHandler,
  ScanRun,
  type DriveJobHandlers,
  type ScanEnvironment,
} from './jobs';
import { ScanCommitter } from './scanner-commit';
import { scopesOf } from './scanner-scope';

async function commitScopes(
  env: ScanEnvironment,
  root: StoredDrive,
  scopes: readonly string[],
  signal: AbortSignal,
): Promise<boolean> {
  const committer = new ScanCommitter(commitDependencies(env, root), root, scopes);
  const unreadable: string[] = [];
  for (const base of scopes) {
    const outcome = await new ScanRun(env, root, committer, { base, full: false }).walk(signal);
    if (outcome.cancelled) return false;
    unreadable.push(...outcome.unreadable);
  }
  await committer.finish(unreadable);
  return true;
}

async function reflectPaths(
  env: ScanEnvironment,
  root: StoredDrive,
  paths: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  const startedAt = performance.now();
  await env.lanes.run([root.id], async () => {
    const scopes = scopesOf(env.store.driveItems, root.id, paths);
    const finished = await commitScopes(env, root, scopes, signal);
    env.log.info(finished ? 'drive.reflect_done' : 'drive.reflect_cancelled', {
      rootId: root.id,
      paths: paths.length,
      scopes: scopes.length,
      durationMs: Math.round(performance.now() - startedAt),
    });
  });
}

export function reflectHandler(env: ScanEnvironment): DriveJobHandlers['reflect'] {
  const scan = scanHandler(env);
  return async (job, signal) => {
    if (job.paths.includes('')) {
      await scan({ kind: 'scan', rootId: job.rootId }, signal);
      return;
    }
    const root = env.store.driveRoots.find(job.rootId);
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
      env.store.driveRoots.update(job.rootId, { state: 'error', stateReason: messageOf(cause) });
    }
  };
}
