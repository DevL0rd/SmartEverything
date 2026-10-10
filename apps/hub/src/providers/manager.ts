import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PROVIDER,
  PROVIDER_CREDENTIALS,
  unseal,
  type AdapterSink,
  type ProviderHubCommand,
  type JsonValue,
  type Provider,
  type ProviderAdapter,
  type Sealed,
  type Unsubscribe,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { LinkContext, RunContext, StoredAccount } from '../adapters/contract';
import {
  ProviderNotRunningError,
  describeError,
  type AdapterDirectory,
} from '../commands/executor';
import type { HubDatabase } from '../database/port';
import type { SecretStore } from '../secrets/store';
import type { EventRouter } from '../state/event-router';
import type { Inventory } from '../state/inventory';
import type { StateWriter } from '../state/state-writer';
import { problemOf } from './problems';
import { PromptBroker } from './prompts';
import { linkAccount, starterFor, type ModuleRegistry } from './registry-types';

export interface ProviderManagerOptions {
  readonly registry: ModuleRegistry;
  readonly secrets: SecretStore;
  readonly store: Pick<HubDatabase, 'updateProviderLink'>;
  readonly inventory: Pick<Inventory, 'apply' | 'markOffline' | 'devicesOf'>;
  readonly state: Pick<StateWriter, 'push'>;
  readonly events: Pick<EventRouter, 'fromProvider'>;
  readonly dataDirectory: string;
  readonly accountChanged: (provider: Provider, account: StoredAccount | null) => Promise<void>;
  readonly log: Logger;
}

const RETRY_FIRST_SECONDS = 5;

const RETRY_CAP_SECONDS = 60;

interface Running {
  readonly adapter: ProviderAdapter;
  readonly unsubscribe: Unsubscribe;
}

class CredentialsMismatchError extends Error {
  override readonly name = 'CredentialsMismatchError';

  constructor(expected: Provider, received: Provider) {
    super(`The link command was for ${expected}, but the sealed credentials are for ${received}.`);
  }
}

export class ProviderManager implements AdapterDirectory {
  private readonly running = new Map<Provider, Running>();
  private readonly retries = new Map<Provider, NodeJS.Timeout>();
  private readonly prompts: PromptBroker;

  constructor(private readonly options: ProviderManagerOptions) {
    this.prompts = new PromptBroker(options.store);
  }

  adapterFor(provider: Provider): ProviderAdapter | undefined {
    return this.running.get(provider)?.adapter;
  }

  async startLinked(): Promise<void> {
    const accounts = Object.entries(this.options.secrets.read().accounts);
    await Promise.all(
      accounts.map(([name, account]) => this.startStored(PROVIDER.parse(name), account, 0)),
    );
  }

  private async startStored(provider: Provider, account: StoredAccount, attempt: number): Promise<void> {
    this.cancelRetry(provider);
    try {
      await this.start(provider, account);
    } catch (cause) {
      const problem = problemOf(cause);
      this.options.log.error('provider.start_failed', cause, { provider, attempt });
      await this.options.store.updateProviderLink(provider, {
        status: 'needs_attention',
        phase: null,
        problem,
        lastError: describeError(cause),
      });
      if (problem === 'network') {
        this.scheduleRetry(provider, account, attempt);
      }
    }
  }

  private scheduleRetry(provider: Provider, account: StoredAccount, attempt: number): void {
    const seconds = Math.min(RETRY_FIRST_SECONDS * 3 ** attempt, RETRY_CAP_SECONDS);
    this.options.log.info('provider.start_retry_scheduled', { provider, attempt, seconds });
    const timer = setTimeout(() => {
      this.retries.delete(provider);
      void this.startStored(provider, account, attempt + 1);
    }, seconds * 1000);
    timer.unref();
    this.retries.set(provider, timer);
  }

  private cancelRetry(provider: Provider): void {
    clearTimeout(this.retries.get(provider));
    this.retries.delete(provider);
  }

  async handle(command: ProviderHubCommand): Promise<JsonValue> {
    switch (command.capability) {
      case 'hub:link_provider':
        return this.link(command.value.provider, command.value.credentials);
      case 'hub:answer_prompt':
        await this.prompts.answer(command.value.provider, this.unsealed(command.value.answer));
        return { provider: command.value.provider };
      case 'hub:unlink_provider':
        await this.unlink(command.value.provider);
        return { provider: command.value.provider };
      case 'hub:discover':
        return this.discover(command.value.provider);
    }
  }

  async stopAll(): Promise<void> {
    this.prompts.cancelAll();
    for (const provider of [...this.retries.keys()]) {
      this.cancelRetry(provider);
    }
    await Promise.all([...this.running.keys()].map((provider) => this.stop(provider)));
  }

  private unsealed(sealed: Sealed): string {
    return unseal(this.options.secrets.sealingKeys(), sealed);
  }

  private linkContext(provider: Provider): LinkContext {
    return {
      log: this.options.log.child({ actorId: provider }),
      dataDirectory: join(this.options.dataDirectory, 'providers', provider),
      ask: (prompt) => this.prompts.ask(provider, prompt),
      show: (prompt) => this.prompts.show(provider, prompt),
    };
  }

  private async link(provider: Provider, sealed: Sealed): Promise<JsonValue> {
    const credentials = PROVIDER_CREDENTIALS.parse(JSON.parse(this.unsealed(sealed)));
    if (credentials.provider !== provider) {
      throw new CredentialsMismatchError(provider, credentials.provider);
    }
    await this.options.store.updateProviderLink(provider, {
      status: 'linking',
      prompt: null,
      phase: 'signing_in',
      problem: null,
      lastError: null,
    });
    try {
      const context = this.linkContext(provider);
      await mkdir(context.dataDirectory, { recursive: true, mode: 0o700 });
      const account = await linkAccount(this.options.registry, credentials, context);
      await this.saveAccount(provider, account);
      const deviceCount = await this.start(provider, account);
      return { provider, deviceCount };
    } catch (cause) {
      this.prompts.cancel(provider);
      await this.options.store.updateProviderLink(provider, {
        status: 'unlinked',
        prompt: null,
        phase: null,
        problem: problemOf(cause),
        lastError: describeError(cause),
      });
      throw cause;
    }
  }

  private async saveAccount(provider: Provider, account: StoredAccount): Promise<void> {
    await this.options.secrets.saveAccount(provider, account);
    await this.options.accountChanged(provider, account);
  }

  private runContext(provider: Provider): RunContext {
    return {
      ...this.linkContext(provider),
      saveAccount: (account) => this.saveAccount(provider, account),
      needsAttention: (cause) =>
        this.options.store.updateProviderLink(provider, {
          status: 'needs_attention',
          phase: null,
          problem: problemOf(cause),
          lastError: cause.message,
        }),
    };
  }

  private sink(provider: Provider): AdapterSink {
    return {
      state: (update): void => {
        this.options.state.push(provider, update);
      },
      event: (event): void => {
        this.options.events.fromProvider(provider, event);
      },
      devices: (devices): void => {
        this.applyDevices(provider, devices).catch((cause: unknown) => {
          this.options.log.error('provider.devices_not_applied', cause, {
            provider,
            count: devices.length,
          });
        });
      },
      failure: (failure): void => {
        this.options.log.error('provider.failed', failure.cause, {
          provider,
          externalId: failure.externalId,
          operation: failure.operation,
        });
        void this.options.store
          .updateProviderLink(provider, {
            lastError: `${failure.operation}: ${describeError(failure.cause)}`,
          })
          .catch((cause: unknown) => {
            this.options.log.error('provider.error_not_recorded', cause, { provider });
          });
      },
    };
  }

  private async applyDevices(
    provider: Provider,
    devices: Parameters<AdapterSink['devices']>[0],
  ): Promise<number> {
    const records = await this.options.inventory.apply(provider, devices);
    const deviceCount = this.options.inventory.devicesOf(provider).length;
    await this.options.store.updateProviderLink(provider, { deviceCount });
    return records.length;
  }

  private async start(provider: Provider, account: StoredAccount): Promise<number> {
    await this.stop(provider);
    await this.options.store.updateProviderLink(provider, { phase: 'discovering' });
    const context = this.runContext(provider);
    await mkdir(context.dataDirectory, { recursive: true, mode: 0o700 });
    const starter = starterFor(this.options.registry, provider);
    const adapter = await starter.start(account, context);
    const deviceCount = await this.applyDevices(provider, await adapter.discover());
    const unsubscribe = await adapter.subscribe(this.sink(provider));
    this.running.set(provider, { adapter, unsubscribe });
    await this.refresh(provider, adapter);
    await this.options.store.updateProviderLink(provider, {
      status: 'linked',
      accountLabel: starter.labelOf?.(account) ?? account.label,
      prompt: null,
      phase: null,
      problem: null,
      lastError: null,
    });
    this.options.log.info('provider.started', { provider, deviceCount });
    return deviceCount;
  }

  private async refresh(provider: Provider, adapter: ProviderAdapter): Promise<void> {
    const externalIds = this.options.inventory
      .devicesOf(provider)
      .map((device) => device.externalId);
    for (const update of await adapter.refresh(externalIds)) {
      this.options.state.push(provider, update);
    }
  }

  private async stop(provider: Provider): Promise<void> {
    this.cancelRetry(provider);
    const running = this.running.get(provider);
    this.prompts.cancel(provider);
    if (running === undefined) {
      return;
    }
    this.running.delete(provider);
    await running.unsubscribe();
    this.options.log.info('provider.stopped', { provider });
  }

  private async unlink(provider: Provider): Promise<void> {
    await this.stop(provider);
    const account = this.options.secrets.read().accounts[provider];
    const signOutError = account === undefined ? null : await this.forget(provider, account);
    await this.options.secrets.removeAccount(provider);
    await this.options.accountChanged(provider, null);
    await this.options.inventory.markOffline(provider);
    await this.options.store.updateProviderLink(provider, {
      status: 'unlinked',
      accountLabel: null,
      prompt: null,
      phase: null,
      problem: null,
      lastError: signOutError,
    });
  }

  private async forget(provider: Provider, account: StoredAccount): Promise<string | null> {
    try {
      await this.options.registry[provider]?.forget?.(account, this.linkContext(provider));
      return null;
    } catch (cause) {
      this.options.log.error('provider.sign_out_failed', cause, { provider });
      return `Unlinked from this hub, but ${provider} did not end the hub's session: ${describeError(cause)}`;
    }
  }

  private async discover(only: Provider | null): Promise<JsonValue> {
    const targets = [...this.running.entries()].filter(
      ([provider]) => only === null || provider === only,
    );
    if (only !== null && targets.length === 0) {
      throw new ProviderNotRunningError(only);
    }
    const counts = await Promise.all(
      targets.map(async ([provider, running]): Promise<[Provider, number]> => [
        provider,
        await this.rediscover(provider, running),
      ]),
    );
    return Object.fromEntries(counts);
  }

  private async rediscover(provider: Provider, running: Running): Promise<number> {
    await this.options.store.updateProviderLink(provider, { phase: 'discovering' });
    try {
      const deviceCount = await this.applyDevices(provider, await running.adapter.discover());
      await this.refresh(provider, running.adapter);
      return deviceCount;
    } finally {
      await this.options.store.updateProviderLink(provider, { phase: null });
    }
  }
}
