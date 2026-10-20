import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PROVIDER,
  type AdapterSink,
  type ProviderHubCommand,
  type JsonValue,
  type Provider,
  type ProviderAdapter,
  type ProviderCredentials,
  type Unsubscribe,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { LinkContext, RunContext, StoredAccount } from '../adapters/contract';
import { ProviderNotRunningError, type AdapterDirectory } from '../commands/executor';
import type { HubDatabase } from '../database/port';
import type { SecretStore } from '../secrets/store';
import type { EventRouter } from '../state/event-router';
import type { Inventory } from '../state/inventory';
import type { StateWriter } from '../state/state-writer';
import { problemOf } from './problems';
import { LinkCancelledError, type Attempt } from './link-attempt';
import { adapterSink } from './adapter-sink';
import { PromptBroker } from './prompts';
import { linkAccount, starterFor, type ModuleRegistry } from './registry-types';
import { background, failureLine } from '@smarteverything/logging';

export interface ProviderManagerOptions {
  readonly registry: ModuleRegistry;
  readonly secrets: SecretStore;
  readonly store: Pick<HubDatabase, 'updateProviderLink'>;
  readonly inventory: Pick<Inventory, 'apply' | 'markOffline' | 'devicesOf' | 'setOnline'>;
  readonly state: Pick<StateWriter, 'push'>;
  readonly prepareAdapter?: (adapter: ProviderAdapter) => void;
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

export class ProviderManager implements AdapterDirectory {
  private readonly running = new Map<Provider, Running>();
  private readonly retries = new Map<Provider, NodeJS.Timeout>();
  private readonly attempts = new Map<Provider, Attempt>();
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

  private async startStored(
    provider: Provider,
    account: StoredAccount,
    attempt: number,
  ): Promise<void> {
    this.cancelRetry(provider);
    const startedAt = performance.now();
    try {
      await this.start(provider, account);
    } catch (cause) {
      const problem = problemOf(cause);
      this.options.log.error('provider.start_failed', cause, {
        provider,
        attempt,
        problem,
        willRetry: problem === 'network',
        durationMs: Math.round(performance.now() - startedAt),
      });
      await this.options.store.updateProviderLink(provider, {
        status: 'needs_attention',
        phase: null,
        problem,
        lastError: failureLine(cause),
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
      background(this.startStored(provider, account, attempt + 1), 'stored.start_failed');
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

  private linkContext(provider: Provider): LinkContext {
    const stored = this.options.secrets.read().accounts[provider];
    return {
      log: this.options.log.child({ actorId: provider }),
      dataDirectory: join(this.options.dataDirectory, 'providers', provider),
      ...(stored === undefined ? {} : { stored }),
      ask: (prompt) => this.prompts.ask(provider, prompt),
      show: (prompt) => this.prompts.show(provider, prompt),
    };
  }

  async link(credentials: ProviderCredentials): Promise<JsonValue> {
    const { provider } = credentials;
    const attempt: Attempt = { cancelled: false };
    this.attempts.set(provider, attempt);
    const startedAt = performance.now();
    this.options.log.info('provider.link_started', {
      provider,
      running: this.running.has(provider),
    });
    try {
      await this.options.store.updateProviderLink(provider, {
        status: 'linking',
        prompt: null,
        phase: 'signing_in',
        problem: null,
        lastError: null,
      });
      const context = this.linkContext(provider);
      await mkdir(context.dataDirectory, { recursive: true, mode: 0o700 });
      const account = await linkAccount(this.options.registry, credentials, context);
      if (attempt.cancelled) {
        throw new LinkCancelledError(provider);
      }
      await this.saveAccount(provider, account);
      const deviceCount = await this.start(provider, account);
      this.options.log.info('provider.link_finished', {
        provider,
        deviceCount,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return { provider, deviceCount };
    } catch (cause) {
      this.options.log.error('provider.link_failed', cause, {
        provider,
        cancelled: attempt.cancelled,
        problem: problemOf(cause),
        durationMs: Math.round(performance.now() - startedAt),
      });
      if (!attempt.cancelled) {
        await this.failLink(provider, cause);
      }
      throw cause;
    } finally {
      if (this.attempts.get(provider) === attempt) {
        this.attempts.delete(provider);
      }
    }
  }

  answer(provider: Provider, answer: string): Promise<void> {
    return this.prompts.answer(provider, answer);
  }

  async cancelLink(provider: Provider): Promise<void> {
    const attempt = this.attempts.get(provider);
    if (attempt !== undefined) {
      attempt.cancelled = true;
    }
    this.prompts.cancel(provider);
    await this.options.store.updateProviderLink(provider, {
      status: this.restingStatus(provider),
      prompt: null,
      phase: null,
    });
  }

  private restingStatus(provider: Provider): 'linked' | 'needs_attention' | 'unlinked' {
    if (!this.hasAccount(provider)) {
      return 'unlinked';
    }
    return this.running.has(provider) ? 'linked' : 'needs_attention';
  }

  private hasAccount(provider: Provider): boolean {
    return this.options.secrets.read().accounts[provider] !== undefined;
  }

  private async failLink(provider: Provider, cause: unknown): Promise<void> {
    this.prompts.cancel(provider);
    await this.options.store.updateProviderLink(provider, {
      status: this.restingStatus(provider),
      prompt: null,
      phase: null,
      problem: problemOf(cause),
      lastError: failureLine(cause),
    });
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

  private async applyDevices(
    provider: Provider,
    devices: Parameters<AdapterSink['devices']>[0],
  ): Promise<number> {
    const records = await this.options.inventory.apply(provider, devices);
    await this.recordDeviceCount(provider);
    return records.length;
  }

  private async publishDevices(
    provider: Provider,
    devices: Parameters<AdapterSink['devices']>[0],
  ): Promise<void> {
    const known = this.options.inventory.devicesOf(provider).length;
    await this.options.inventory.apply(provider, devices);
    if (this.options.inventory.devicesOf(provider).length !== known) {
      await this.recordDeviceCount(provider);
    }
  }

  private async recordDeviceCount(provider: Provider): Promise<void> {
    const deviceCount = this.options.inventory.devicesOf(provider).length;
    await this.options.store.updateProviderLink(provider, { deviceCount });
  }

  private async start(provider: Provider, account: StoredAccount): Promise<number> {
    const startedAt = performance.now();
    this.options.log.info('provider.starting', { provider });
    await this.stop(provider);
    await this.options.store.updateProviderLink(provider, { phase: 'discovering' });
    const context = this.runContext(provider);
    await mkdir(context.dataDirectory, { recursive: true, mode: 0o700 });
    const starter = starterFor(this.options.registry, provider);
    const adapter = await starter.start(account, context);
    this.options.prepareAdapter?.(adapter);
    const discovered = await adapter.discover();
    const deviceCount = await this.applyDevices(provider, discovered);
    this.options.log.debug('provider.discovered', () => ({
      provider,
      discovered: discovered.length,
      deviceCount,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    const unsubscribe = await adapter.subscribe(
      adapterSink(this.options, provider, (devices) => this.publishDevices(provider, devices)),
    );
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
    this.options.log.info('provider.started', {
      provider,
      deviceCount,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return deviceCount;
  }

  private async refresh(provider: Provider, adapter: ProviderAdapter): Promise<void> {
    const externalIds = this.options.inventory
      .devicesOf(provider)
      .map((device) => device.externalId);
    const startedAt = performance.now();
    const updates = await adapter.refresh(externalIds);
    for (const update of updates) {
      this.options.state.push(provider, update);
    }
    this.options.log.debug('provider.refreshed', () => ({
      provider,
      devices: externalIds.length,
      updates: updates.length,
      durationMs: Math.round(performance.now() - startedAt),
    }));
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
      return `Unlinked from this hub, but ${provider} did not end the hub's session: ${failureLine(cause)}`;
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
    const startedAt = performance.now();
    try {
      const deviceCount = await this.applyDevices(provider, await running.adapter.discover());
      await this.refresh(provider, running.adapter);
      this.options.log.info('provider.rediscovered', {
        provider,
        deviceCount,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return deviceCount;
    } catch (cause) {
      this.options.log.error('provider.rediscover_failed', cause, {
        provider,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw cause;
    } finally {
      await this.options.store.updateProviderLink(provider, { phase: null });
    }
  }
}
