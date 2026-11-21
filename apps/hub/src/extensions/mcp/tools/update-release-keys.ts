import { releaseKeysProblem, type UpdateInput } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  ReleaseKeyError,
  removeReleaseKey,
  trustedReleaseKeys,
  trustReleaseKey,
  type TrustedReleaseKey,
} from '../../../releases/trust';
import { ToolError, type ToolContext, type ToolOutput } from './registry';
import { layoutOf, type KeysContext } from './update-common';
import { requireOwnerConnection } from './update-requester';

const log = new Logger('hub.releases');

type ReleaseKeysInput = Omit<Extract<UpdateInput, { action: 'release_keys' }>, 'action'>;

type ReleaseKeysContext = KeysContext & Pick<ToolContext, 'releaseSecrets'>;

function shownKey(key: TrustedReleaseKey): Readonly<Record<string, string>> {
  return {
    fingerprint: key.fingerprint,
    role: key.role,
    label: key.label,
    trustedAt: key.trustedAt,
  };
}

async function changedToken(context: ReleaseKeysContext, input: ReleaseKeysInput): Promise<void> {
  if (input.operation === 'clear') {
    await context.releaseSecrets.saveGithubReleaseToken(null);
    log.info('github_release_token.cleared');
    return;
  }
  if (input.token === undefined) throw new ToolError('set needs token');
  await context.releaseSecrets.saveGithubReleaseToken(input.token);
  log.info('github_release_token.set');
}

async function changedKey(
  path: string,
  input: ReleaseKeysInput,
  now: Date,
): Promise<TrustedReleaseKey | null> {
  const { operation, publicKey, role, label, fingerprint } = input;
  if (operation === 'list') return null;
  if (operation === 'remove') {
    if (fingerprint === undefined) throw new ToolError('remove needs fingerprint');
    return removeReleaseKey(path, fingerprint);
  }
  if (publicKey === undefined || role === undefined || label === undefined)
    throw new ToolError('trust needs publicKey, role and label');
  return trustReleaseKey(path, { publicKey, role, label }, now);
}

async function changed(
  context: ReleaseKeysContext,
  path: string,
  input: ReleaseKeysInput,
): Promise<TrustedReleaseKey | null> {
  if (input.operation !== 'set' && input.operation !== 'clear')
    return changedKey(path, input, context.clock.now());
  await changedToken(context, input);
  return null;
}

export async function releaseKeys(
  context: ReleaseKeysContext,
  input: ReleaseKeysInput,
): Promise<ToolOutput> {
  if (input.operation !== 'list') await requireOwnerConnection(context);
  const path = (await layoutOf(context)).system.keys.releaseKeys;
  const problem = releaseKeysProblem({ ...input, action: 'release_keys' });
  if (problem !== null) throw new ToolError(problem);
  try {
    const key = await changed(context, path, input);
    const keys = await trustedReleaseKeys(path);
    return {
      structured: {
        operation: input.operation,
        changed: key === null ? null : shownKey(key),
        keys: keys.map(shownKey),
        githubTokenStored: context.releaseSecrets.githubReleaseToken() !== null,
      },
    };
  } catch (cause) {
    if (cause instanceof ReleaseKeyError) throw new ToolError(cause.message);
    throw cause;
  }
}
