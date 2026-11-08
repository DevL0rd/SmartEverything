import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  API_ENDPOINTS,
  WEB_BUNDLE_EMBEDDED,
  WEB_UPDATE_RUNNING,
  apiErrorOf,
  encodeQuery,
  type AppUpdateChannel,
  type AppUpdateCompatible,
  type AppUpdateOffer,
  type AppUpdateQuery,
  type AppUpdateSummary,
  type DesktopServer,
  type WebUpdateApplyTarget,
  type WebUpdateRunning,
  type WebUpdateStatus,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { UpdateInstallError } from '../updates/update-errors.js';
import { downloadBundle, type BundleProgress } from './bundle-download.js';
import type { WebBuild, WebBundleStore } from './bundle-store.js';

const log = new Logger('desktop.web-update');

const BUNDLE_FILE = 'bundle.json';
const NOT_CONNECTED = 'Connect this computer to your home to get updates.';
const UNFINISHED_START = 'The last start of this update never finished.';

const RUNNING_FILE = z.object({
  id: WEB_UPDATE_RUNNING.shape.id,
  createdAt: WEB_UPDATE_RUNNING.shape.createdAt,
});

export type WebUpdateMode =
  | { readonly kind: 'disabled'; readonly reason: string }
  | { readonly kind: 'enabled'; readonly build: WebBuild; readonly store: WebBundleStore };

type EnabledMode = Extract<WebUpdateMode, { readonly kind: 'enabled' }>;

export interface WebUpdateControllerOptions {
  readonly mode: WebUpdateMode;
  readonly server: () => Promise<DesktopServer | null>;
  readonly fetch: typeof fetch;
}

export type WebReload = () => void | Promise<void>;

type Listener = (status: WebUpdateStatus) => void;

interface Decision {
  readonly status: WebUpdateStatus;
  readonly held: AppUpdateCompatible | null;
}

async function readWebOffer(
  server: DesktopServer,
  query: AppUpdateQuery,
  fetchFrom: typeof fetch,
): Promise<AppUpdateOffer> {
  const endpoint = API_ENDPOINTS.readAppUpdate;
  const url = new URL(`${endpoint.path}${encodeQuery(query)}`, server.url);
  const response = await fetchFrom(url, {
    method: endpoint.method,
    headers: { authorization: `Bearer ${server.token}` },
  });
  const body: unknown = await response.json();
  if (!response.ok) throw apiErrorOf(response.status, body);
  return endpoint.response.parse(body);
}

async function runningOf(mode: EnabledMode): Promise<WebUpdateRunning> {
  const root = await mode.store.rootFor(mode.build);
  if (root === mode.build.embeddedRoot) {
    return { id: WEB_BUNDLE_EMBEDDED, createdAt: mode.build.embeddedCreatedAt };
  }
  return RUNNING_FILE.parse(JSON.parse(await readFile(path.join(root, BUNDLE_FILE), 'utf8')));
}

function idle(running: WebUpdateRunning): WebUpdateStatus {
  return { state: 'idle', running };
}

function noCompatibleUpdate(newer: AppUpdateSummary | null, running: WebUpdateRunning): Decision {
  const status: WebUpdateStatus =
    newer !== null && Date.parse(newer.createdAt) > Date.parse(running.createdAt)
      ? { state: 'needs_installer', newer }
      : idle(running);
  return { status, held: null };
}

function decide(
  offer: AppUpdateOffer,
  running: WebUpdateRunning,
  failed: readonly string[],
  before: WebUpdateStatus,
): Decision {
  const { compatible, newerIncompatible } = offer;
  if (compatible === null) return noCompatibleUpdate(newerIncompatible, running);
  if (
    compatible.id === running.id ||
    Date.parse(compatible.createdAt) <= Date.parse(running.createdAt)
  ) {
    return noCompatibleUpdate(newerIncompatible, running);
  }
  if (failed.includes(compatible.id)) {
    const kept = before.state === 'rolled_back' && before.failedId === compatible.id;
    return { status: kept ? before : idle(running), held: compatible };
  }
  const kept = before.state === 'ready' && before.offer.id === compatible.id;
  return { status: kept ? before : { state: 'available', offer: compatible }, held: null };
}

function queryFor(
  mode: EnabledMode,
  channel: AppUpdateChannel,
  running: WebUpdateRunning,
): AppUpdateQuery {
  return {
    platform: 'desktop',
    channel,
    runtimeVersion: mode.build.runtime,
    ...(running.id === WEB_BUNDLE_EMBEDDED ? {} : { currentId: running.id }),
  };
}

function totalOf(offer: AppUpdateCompatible): number {
  return offer.files.reduce((sum, file) => sum + file.size, 0);
}

function matchesApplyTarget(
  status: Extract<WebUpdateStatus, { state: 'ready' | 'rollback_ready' }>,
  target: WebUpdateApplyTarget,
): boolean {
  return status.state === 'ready'
    ? target.kind === 'update' && target.id === status.offer.id
    : target.kind === 'built_in';
}

export class WebUpdateController {
  readonly #options: WebUpdateControllerOptions;
  readonly #listeners = new Set<Listener>();
  #status: WebUpdateStatus;
  #held: AppUpdateCompatible | null = null;
  #percent = 0;
  #channel: AppUpdateChannel | null = null;

  private constructor(options: WebUpdateControllerOptions, initial: WebUpdateStatus) {
    this.#options = options;
    this.#status = initial;
  }

  static async create(options: WebUpdateControllerOptions): Promise<WebUpdateController> {
    const { mode } = options;
    const initial: WebUpdateStatus =
      mode.kind === 'disabled'
        ? { state: 'disabled', reason: mode.reason }
        : idle(await runningOf(mode));
    return new WebUpdateController(options, initial);
  }

  status(): WebUpdateStatus {
    return this.#status;
  }

  onChange(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async check(channel: AppUpdateChannel): Promise<WebUpdateStatus> {
    const mode = this.#enabled();
    if (mode === null || this.#busy()) return this.#status;
    const before = this.#status;
    this.#channel = channel;
    this.#set({ state: 'checking' });
    try {
      return this.#set(await this.#looked(mode, channel, before));
    } catch (cause) {
      log.warn('web_update.check_failed', { reason: messageOf(cause) });
      return this.#set({
        state: 'failed',
        reason: `Could not look for an update: ${messageOf(cause)}`,
        offer: null,
      });
    }
  }

  async download(expectedId: string): Promise<WebUpdateStatus> {
    const mode = this.#enabled();
    const target = this.#downloadable();
    const channel = this.#channel;
    const current = this.#status;
    const offeredId = current.state === 'ready' ? current.offer.id : target?.id;
    if (offeredId !== undefined && offeredId !== expectedId) {
      throw new UpdateInstallError(
        'starting the download',
        'the selected update is no longer available',
      );
    }
    if (mode === null || target === null || channel === null) return current;
    this.#percent = 0;
    this.#set({ state: 'downloading', offer: target, received: 0, total: totalOf(target) });
    try {
      const { server, offer } = await this.#signed(mode, channel, target);
      await downloadBundle({
        directory: mode.store.directory,
        offer,
        runtime: mode.build.runtime,
        serverUrl: server.url,
        fetch: this.#options.fetch,
        onProgress: (progress) => {
          this.#progress(offer, progress);
        },
      });
    } catch (cause) {
      log.error('web_update.download_failed', cause, { id: target.id });
      return this.#set({
        state: 'failed',
        reason: `The update could not be downloaded: ${messageOf(cause)}`,
        offer: target,
      });
    }
    return this.#status.state === 'downloading'
      ? this.#set({ state: 'ready', offer: target })
      : this.#status;
  }

  async apply(target: WebUpdateApplyTarget, reload: WebReload): Promise<WebUpdateStatus> {
    const mode = this.#enabled();
    const channel = this.#channel;
    const current = this.#status;
    if (mode === null || channel === null) return current;
    if (current.state !== 'ready' && current.state !== 'rollback_ready') {
      throw new UpdateInstallError('preparing to restart', `the desktop app is ${current.state}`);
    }
    if (!matchesApplyTarget(current, target)) {
      throw new UpdateInstallError(
        'preparing to restart',
        'the selected update is no longer ready',
      );
    }
    this.#set({ state: 'applying' });
    try {
      if (current.state === 'ready') {
        await this.#signed(mode, channel, current.offer);
        await this.#applyBundle(mode, current.offer, reload);
      } else {
        await this.#applyEmbedded(mode, channel, current.currentId, reload);
      }
    } catch (cause) {
      const offer = current.state === 'ready' ? current.offer : null;
      const id = current.state === 'ready' ? current.offer.id : current.currentId;
      log.error('web_update.apply_failed', cause, { id });
      return this.#set({
        state: 'failed',
        reason: `The update could not be applied: ${messageOf(cause)}`,
        offer,
      });
    }
    return this.#status;
  }

  async #applyBundle(
    mode: EnabledMode,
    offer: AppUpdateCompatible,
    reload: WebReload,
  ): Promise<void> {
    await mode.store.begin(offer.id);
    try {
      await reload();
    } catch (cause) {
      await mode.store.revert('The window could not restart into the update.');
      throw cause;
    }
  }

  async #applyEmbedded(
    mode: EnabledMode,
    channel: AppUpdateChannel,
    currentId: string,
    reload: WebReload,
  ): Promise<void> {
    const running = await runningOf(mode);
    const server = await this.#options.server();
    if (server === null) throw new UpdateInstallError('confirming the rollback', NOT_CONNECTED);
    const offer = await readWebOffer(server, queryFor(mode, channel, running), this.#options.fetch);
    if (running.id !== currentId || !offer.rollBackToEmbedded) {
      throw new UpdateInstallError(
        'confirming the rollback',
        'the home no longer offers this rollback',
      );
    }
    await mode.store.restoreEmbedded(currentId);
    await reload();
  }

  async confirm(): Promise<WebUpdateStatus> {
    const mode = this.#enabled();
    if (mode === null) return this.#status;
    const trial = await mode.store.trialId();
    await mode.store.confirm();
    if (trial !== null || this.#status.state === 'applying') {
      await mode.store.removeSuperseded();
    }
    if (this.#status.state !== 'applying') return this.#status;
    return this.#set(idle(await runningOf(mode)));
  }

  bootFailed(reason: string): Promise<WebUpdateStatus> {
    return this.#revert(reason);
  }

  launchCheck(): Promise<WebUpdateStatus> {
    return this.#revert(UNFINISHED_START);
  }

  async #revert(reason: string): Promise<WebUpdateStatus> {
    const mode = this.#enabled();
    if (mode === null) return this.#status;
    const result = await mode.store.revert(reason);
    if (result.kind === 'not_in_trial') return this.#status;
    this.#held = null;
    return this.#set({ state: 'rolled_back', failedId: result.failedId, reason });
  }

  async #looked(
    mode: EnabledMode,
    channel: AppUpdateChannel,
    before: WebUpdateStatus,
  ): Promise<WebUpdateStatus> {
    const server = await this.#options.server();
    if (server === null) return { state: 'disabled', reason: NOT_CONNECTED };
    const running = await runningOf(mode);
    const offer = await readWebOffer(server, queryFor(mode, channel, running), this.#options.fetch);
    if (offer.rollBackToEmbedded && running.id !== WEB_BUNDLE_EMBEDDED) {
      this.#held = null;
      return { state: 'rollback_ready', currentId: running.id };
    }
    const decision = decide(offer, running, await mode.store.failed(), before);
    this.#held = decision.held;
    return decision.status;
  }

  async #signed(
    mode: EnabledMode,
    channel: AppUpdateChannel,
    target: AppUpdateCompatible,
  ): Promise<{ readonly server: DesktopServer; readonly offer: AppUpdateCompatible }> {
    const server = await this.#options.server();
    if (server === null)
      throw new UpdateInstallError('asking the home for the files', NOT_CONNECTED);
    const query = queryFor(mode, channel, await runningOf(mode));
    const { compatible } = await readWebOffer(server, query, this.#options.fetch);
    if (compatible?.id !== target.id) {
      throw new UpdateInstallError(
        'asking the home for the files',
        `the home no longer offers update ${target.id}`,
      );
    }
    return { server, offer: compatible };
  }

  #downloadable(): AppUpdateCompatible | null {
    const current = this.#status;
    if (current.state === 'available') return current.offer;
    if (current.state === 'failed') return current.offer;
    if (current.state === 'rolled_back') {
      return this.#held?.id === current.failedId ? this.#held : null;
    }
    return null;
  }

  #progress(offer: AppUpdateCompatible, progress: BundleProgress): void {
    const whole = Math.floor((progress.received * 100) / progress.total);
    if (whole === this.#percent || this.#status.state !== 'downloading') return;
    this.#percent = whole;
    this.#set({ state: 'downloading', offer, ...progress });
  }

  #enabled(): EnabledMode | null {
    return this.#options.mode.kind === 'enabled' ? this.#options.mode : null;
  }

  #busy(): boolean {
    const { state } = this.#status;
    return state === 'checking' || state === 'downloading' || state === 'applying';
  }

  #set(status: WebUpdateStatus): WebUpdateStatus {
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
    return status;
  }
}
