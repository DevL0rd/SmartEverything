import type {
  DiscoveredDevice,
  ProviderAdapter,
  ProviderProblem,
  TUYA_CREDENTIALS,
} from '@smarteverything/domain';
import { TuyaCloudError, type SmartLifeSession, type TuyaErrorKind } from '@smarteverything/tuya';
import type { z } from 'zod';
import {
  ProviderProblemError,
  type LinkContext,
  type ProviderModule,
  type RunContext,
  type StoredAccount,
} from '../contract';
import {
  labelOf,
  projectAccount,
  projectSecretsFrom,
  secretsOf,
  smartLifeAccount,
  type TuyaSecrets,
} from './account';
import type { TuyaBackend } from './backend';
import { TuyaCloud } from './cloud-client';
import { listDevices } from './cloud-inventory';
import { executeCommand, refreshStates } from './commands';
import type { TuyaDependencies } from './dependencies';
import { developerBackend } from './developer-backend';
import { TuyaRuntime } from './runtime';
import { expireTerminal, smartLifeBackend } from './smart-life-backend';
import { homeDevices } from './smart-life-inventory';
import { SmartLifeCloud } from './smart-life-cloud';
import { signInWithUserCode } from './smart-life-link';

const ACCOUNT_PROBLEMS: ReadonlyMap<TuyaErrorKind, ProviderProblem> = new Map<
  TuyaErrorKind,
  ProviderProblem
>([
  ['credentials', 'bad_credentials'],
  ['token', 'session_expired'],
  ['permission', 'permission_denied'],
  ['subscription', 'not_supported'],
]);

function accountProblem(cause: unknown): ProviderProblemError | null {
  if (!(cause instanceof TuyaCloudError)) {
    return null;
  }
  const problem = ACCOUNT_PROBLEMS.get(cause.kind);
  return problem === undefined ? null : new ProviderProblemError(problem, cause);
}

async function classified<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    throw accountProblem(cause) ?? cause;
  }
}

function adapterOf(runtime: TuyaRuntime): ProviderAdapter {
  return {
    provider: 'tuya',
    discover: async (): Promise<readonly DiscoveredDevice[]> => {
      await runtime.load();
      return runtime.devices();
    },
    subscribe: (sink) => runtime.subscribe(sink),
    execute: (command) => executeCommand(runtime, command),
    refresh: (externalIds) =>
      refreshStates(
        runtime,
        externalIds,
        new Date(runtime.options.dependencies.now()).toISOString(),
      ),
  };
}

async function linkSmartLife(
  userCode: string,
  dependencies: TuyaDependencies,
  context: LinkContext,
): Promise<StoredAccount> {
  let session = await signInWithUserCode(userCode, dependencies, context);
  const cloud = new SmartLifeCloud({
    session,
    dependencies,
    renewed: (renewed): Promise<void> => {
      session = renewed;
      return Promise.resolve();
    },
  });
  const { devices } = await homeDevices(cloud);
  context.log.info('tuya.linked', { method: 'smart_life', devices: devices.length });
  return smartLifeAccount(session);
}

function backendOf(
  secrets: TuyaSecrets,
  dependencies: TuyaDependencies,
  context: RunContext,
): TuyaBackend {
  if (secrets.method === 'developer_project') {
    return developerBackend(secrets, dependencies);
  }
  return smartLifeBackend({
    session: secrets,
    dependencies,
    renewed: (session: SmartLifeSession) => context.saveAccount(smartLifeAccount(session)),
    lost: (cause) => context.needsAttention(new ProviderProblemError('session_expired', cause)),
  });
}

async function linkAccount(
  credentials: z.output<typeof TUYA_CREDENTIALS>,
  dependencies: TuyaDependencies,
  context: LinkContext,
): Promise<StoredAccount> {
  if (credentials.method === 'smart_life') {
    return linkSmartLife(credentials.userCode, dependencies, context);
  }
  const secrets = projectSecretsFrom(credentials);
  const devices = await classified(() =>
    listDevices(new TuyaCloud(secrets, dependencies), secrets.appUserId),
  );
  context.log.info('tuya.linked', { method: 'developer_project', devices: devices.length });
  return projectAccount(secrets, devices.length);
}

export function createTuyaModule(dependencies: TuyaDependencies): ProviderModule<'tuya'> {
  return {
    provider: 'tuya',
    link: (credentials, context) => linkAccount(credentials, dependencies, context),
    labelOf: (account): string => labelOf(secretsOf(account)),
    start: async (account, context): Promise<ProviderAdapter> => {
      const backend = backendOf(secretsOf(account), dependencies, context);
      const runtime = new TuyaRuntime({ backend, dependencies, context });
      try {
        await runtime.load();
      } catch (cause) {
        const problem = accountProblem(cause);
        if (problem !== null) {
          await context.needsAttention(problem);
        }
        throw cause;
      }
      return adapterOf(runtime);
    },
    forget: async (account): Promise<void> => {
      const secrets = secretsOf(account);
      if (secrets.method === 'smart_life') {
        await expireTerminal({ session: secrets, dependencies, renewed: () => Promise.resolve() });
      }
    },
  };
}
