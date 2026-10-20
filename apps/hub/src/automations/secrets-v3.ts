import { randomUUID } from 'node:crypto';
import type {
  AutomationSecretEntry,
  AutomationSecretInput,
  AutomationSecretUser,
} from '@smarteverything/domain';
import type { AutomationSecretRecord, SecretStore } from '../secrets/store';

export class SecretInUseError extends Error {
  override readonly name = 'SecretInUseError';

  constructor(readonly users: readonly AutomationSecretUser[]) {
    super(
      `The secret is used by ${users.map((user) => user.name).join(', ')}; remove it from them first.`,
    );
  }
}

export class SecretMissingError extends Error {
  override readonly name = 'SecretMissingError';

  constructor() {
    super('There is no such secret.');
  }
}

export type SecretUsers = (secretId: string) => readonly AutomationSecretUser[];

export interface AutomationSecrets {
  list(): AutomationSecretEntry[];
  set(input: AutomationSecretInput): Promise<AutomationSecretEntry>;
  remove(id: string): Promise<void>;
  resolve(id: string): string | null;
}

export function automationSecrets(
  store: SecretStore,
  usersOf: SecretUsers,
  now: () => Date = () => new Date(),
): AutomationSecrets {
  const records = (): [string, AutomationSecretRecord][] =>
    Object.entries(store.read().automationSecrets ?? {});
  return {
    list: (): AutomationSecretEntry[] =>
      records()
        .map(([id, record]) => ({
          id,
          name: record.name,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    set: async (input): Promise<AutomationSecretEntry> => {
      const existing = records().find(([, record]) => record.name === input.name);
      const moment = now().toISOString();
      const id = existing?.[0] ?? randomUUID();
      const createdAt = existing?.[1].createdAt ?? moment;
      await store.saveAutomationSecret(id, {
        name: input.name,
        value: input.value,
        createdAt,
        updatedAt: moment,
      });
      return { id, name: input.name, createdAt, updatedAt: moment };
    },
    remove: async (id): Promise<void> => {
      if (!(id in (store.read().automationSecrets ?? {}))) {
        throw new SecretMissingError();
      }
      const users = usersOf(id);
      if (users.length > 0) {
        throw new SecretInUseError(users);
      }
      await store.removeAutomationSecret(id);
    },
    resolve: (id): string | null => store.read().automationSecrets?.[id]?.value ?? null,
  };
}
