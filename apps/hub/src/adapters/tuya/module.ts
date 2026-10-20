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
  type StoredAccount,
} from '../contract';
import { labelOf, secretsOf, smartLifeAccount, storedUserCode } from './account';
import { executeCommand, refreshStates } from './commands';
import type { TuyaDependencies } from './dependencies';
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
]);

function accountProblem(cause: unknown): ProviderProblemError | null {
  if (!(cause instanceof TuyaCloudError)) {
    return null;
  }
  const problem = ACCOUNT_PROBLEMS.get(cause.kind);
  return problem === undefined ? null : new ProviderProblemError(problem, cause);
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

class UserCodeRequiredError extends Error {
  override readonly name = 'UserCodeRequiredError';

  constructor() {
    super(
      'Enter the User Code from the Smart Life app: Me > Settings > Account and Security > User Code.',
    );
  }
}

async function linkAccount(
  credentials: z.output<typeof TUYA_CREDENTIALS>,
  dependencies: TuyaDependencies,
  context: LinkContext,
): Promise<StoredAccount> {
  const userCode = credentials.userCode ?? storedUserCode(context.stored);
  if (userCode === null) {
    throw new ProviderProblemError('bad_credentials', new UserCodeRequiredError());
  }
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
  context.log.info('tuya.linked', {
    devices: devices.length,
    reusedUserCode: credentials.userCode === undefined,
  });
  return smartLifeAccount(session);
}

export function createTuyaModule(dependencies: TuyaDependencies): ProviderModule<'tuya'> {
  return {
    provider: 'tuya',
    link: (credentials, context) => linkAccount(credentials, dependencies, context),
    labelOf: (account): string => labelOf(secretsOf(account)),
    start: async (account, context): Promise<ProviderAdapter> => {
      const backend = smartLifeBackend({
        session: secretsOf(account),
        dependencies,
        renewed: (session: SmartLifeSession) => context.saveAccount(smartLifeAccount(session)),
        lost: (cause) => context.needsAttention(new ProviderProblemError('session_expired', cause)),
      });
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
      await expireTerminal({
        session: secretsOf(account),
        dependencies,
        renewed: () => Promise.resolve(),
      });
    },
  };
}
