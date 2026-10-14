import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SubscriptionProviderError } from '../providers/errors';
import {
  SUBSCRIPTION_CREDENTIAL,
  SUBSCRIPTION_CREDENTIAL_READER,
  SUBSCRIPTION_ROUTE_ID,
  CHATGPT_REGISTRATION,
} from './contracts';
import type { SubscriptionCredential, SubscriptionStorage, ChatgptRegistration } from './contracts';

const HOST_ID = z.strictObject({ hostId: z.uuid() });

export class SubscriptionCredentials {
  private readonly listeners = new Set<(routeId: string, generation: string | undefined) => void>();
  private readonly unwatch: () => void;
  private storageFailure: SubscriptionProviderError | undefined;
  constructor(
    private readonly storage: SubscriptionStorage,
    readonly hostId: string,
  ) {
    z.uuid().parse(hostId);
    this.unwatch = storage.watch((key) => {
      void this.observeExternalChange(key).catch((error: unknown) => {
        this.storageFailure = new SubscriptionProviderError(
          'STORAGE_FAILED',
          `Subscription credential observation failed (${error instanceof Error ? error.name : 'unknown'}).`,
        );
        const routeId = key.startsWith('route-') ? key.slice('route-'.length) : '*';
        for (const listener of this.listeners) listener(routeId, undefined);
      });
    });
  }

  onChanged(listener: (routeId: string, generation: string | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  static async open(storage: SubscriptionStorage): Promise<SubscriptionCredentials> {
    const hostId = await storage.exclusive(async () => {
      const stored = await storage.read('host');
      if (stored !== undefined) return HOST_ID.parse(stored).hostId;
      const value = { hostId: randomUUID() };
      await storage.write('host', value);
      return value.hostId;
    });
    return new SubscriptionCredentials(storage, hostId);
  }

  async routes(): Promise<readonly string[]> {
    return this.storage.routes === undefined ? [] : this.storage.routes();
  }

  async read(routeId: string): Promise<SubscriptionCredential | undefined> {
    if (this.storageFailure !== undefined) throw this.storageFailure;
    const raw = await this.storage.read(this.key(routeId));
    if (raw === undefined) return undefined;
    const credential = SUBSCRIPTION_CREDENTIAL_READER.parse(raw);
    if (credential.routeId !== routeId || credential.hostId !== this.hostId)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Subscription credential belongs to another route or supplying host.',
      );
    return credential;
  }

  dispose(): void {
    this.unwatch();
    this.listeners.clear();
  }

  private async observeExternalChange(key: string): Promise<void> {
    if (!key.startsWith('route-'))
      throw new SubscriptionProviderError(
        'STORAGE_FAILED',
        'Subscription credential storage observation is unavailable.',
      );
    const routeId = SUBSCRIPTION_ROUTE_ID.parse(key.slice('route-'.length));
    const current = await this.read(routeId);
    for (const listener of this.listeners) listener(routeId, current?.generation);
  }

  async registration(routeId: string): Promise<ChatgptRegistration | undefined> {
    const raw = await this.storage.read(this.registrationKey(routeId));
    if (raw === undefined) return undefined;
    const registration = CHATGPT_REGISTRATION.parse(raw);
    if (registration.hostId !== this.hostId || registration.routeId !== routeId)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Saved registration belongs to another route or supplying host.',
      );
    return registration;
  }

  modify<T>(
    routeId: string,
    operation: (
      current: SubscriptionCredential | undefined,
    ) => Promise<{ readonly credential: SubscriptionCredential | undefined; readonly result: T }>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.storage.exclusive(async () => {
      const current = await this.read(routeId);
      const outcome = await operation(current);
      signal?.throwIfAborted();
      if (outcome.credential === undefined) await this.storage.remove(this.key(routeId));
      else await this.install(routeId, outcome.credential, current, signal);
      if (current?.generation !== outcome.credential?.generation)
        for (const listener of this.listeners) listener(routeId, outcome.credential?.generation);
      return outcome.result;
    });
  }

  private async install(
    routeId: string,
    value: SubscriptionCredential,
    previous: SubscriptionCredential | undefined,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const credential = SUBSCRIPTION_CREDENTIAL.parse(value);
    if (credential.routeId !== routeId || credential.hostId !== this.hostId)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Refusing credentials for another route or supplying host.',
      );
    const previousRegistration =
      credential.kind === 'chatgpt-subscription' ? await this.registration(routeId) : undefined;
    signal?.throwIfAborted();
    try {
      if (credential.kind === 'chatgpt-subscription')
        await this.storage.write(
          this.registrationKey(routeId),
          CHATGPT_REGISTRATION.parse({
            routeId,
            hostId: credential.hostId,
            clientId: credential.clientId,
            issuer: credential.issuer,
            subject: credential.subject,
          }),
          signal,
        );
      signal?.throwIfAborted();
      await this.storage.write(this.key(routeId), credential, signal);
      signal?.throwIfAborted();
    } catch (error) {
      await this.restore(this.key(routeId), previous);
      if (credential.kind === 'chatgpt-subscription')
        await this.restore(this.registrationKey(routeId), previousRegistration);
      throw error;
    }
  }

  private async restore(key: string, value: unknown): Promise<void> {
    try {
      if (value === undefined) await this.storage.remove(key);
      else await this.storage.write(key, value);
    } catch (error) {
      this.storageFailure = new SubscriptionProviderError(
        'STORAGE_FAILED',
        `Subscription credential restoration failed (${error instanceof Error ? error.name : 'unknown'}).`,
      );
      for (const listener of this.listeners) listener('*', undefined);
      throw this.storageFailure;
    }
  }

  save(credential: SubscriptionCredential): Promise<void> {
    return this.modify(credential.routeId, () =>
      Promise.resolve({ credential, result: undefined }),
    );
  }

  clear(routeId: string): Promise<void> {
    return this.modify(routeId, () =>
      Promise.resolve({ credential: undefined, result: undefined }),
    );
  }

  private registrationKey(routeId: string): string {
    return `registration-${SUBSCRIPTION_ROUTE_ID.parse(routeId)}`;
  }

  private key(routeId: string): string {
    return `route-${SUBSCRIPTION_ROUTE_ID.parse(routeId)}`;
  }
}
