import { dirname } from 'node:path';
import { manifestOf, manifestPathOf, swapPaths } from './exchange-files';
import {
  abandonIntent,
  exchangeRelPath,
  locate,
  tmpRelPath,
  type DriveWriteRoot,
  type FileEnv,
} from './intents';
import { DriveWriteError } from './write-error';
import { openIntent } from './intent-batch';
import type { DriveIntent } from '../store/repositories/drive-intents';

export async function exchangeWithin(
  env: FileEnv,
  root: DriveWriteRoot,
  paths: { readonly a: string; readonly b: string },
): Promise<DriveIntent> {
  const [a, b] = [await locate(root, paths.a), await locate(root, paths.b)];
  const [first, second] = [await env.files.stamp(a), await env.files.stamp(b)];
  if (first === null || second === null) {
    throw new DriveWriteError('missing', 'Both items to exchange must exist.');
  }
  const intent = await openIntent(env.store, {
    rootId: root.id,
    op: 'exchange',
    fromPath: paths.a,
    toPath: paths.b,
    versionPath: null,
  });
  try {
    const temporary = await locate(root, exchangeRelPath(intent.id));
    await env.files.mkdir(dirname(temporary));
    await env.files.writeDurable(
      manifestPathOf(temporary),
      await locate(root, tmpRelPath()),
      manifestOf(first, second),
    );
    await swapPaths(env.files, { a, b, temporary });
  } catch (cause) {
    await abandonIntent(env, root, intent);
    throw cause;
  }
  return intent;
}

export async function settleExchange(
  env: FileEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
): Promise<void> {
  await env.files.remove(manifestPathOf(await locate(root, exchangeRelPath(intent.id))));
}
