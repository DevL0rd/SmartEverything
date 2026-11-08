import {
  machineUpdateApplies,
  type DesktopServer,
  type MachineUpdateKind,
  type MachineUpdateOffer,
  type MachineUpdateProgress,
  type MachineUpdateStatus,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { InstallKind } from './install-kind.js';
import { downloadArtifact } from './update-download.js';
import { UpdateCleanupError, UpdateInstallError } from './update-errors.js';
import { readOffer, updateTargetOf } from './update-source.js';

const log = new Logger('desktop.update');

export interface StagedUpdate {
  readonly version: string;
  readonly directory: string;
  readonly files: ReadonlyMap<MachineUpdateKind, string>;
}

export interface UpdateControllerOptions {
  readonly version: string;
  readonly platform: string;
  readonly arch: string;
  readonly install: InstallKind;
  readonly server: () => Promise<DesktopServer | null>;
  readonly fetch: typeof fetch;
  readonly stagingDirectory: string;
  readonly apply: (staged: StagedUpdate) => Promise<void>;
}

type Listener = (status: MachineUpdateStatus) => void;

const NEWEST: MachineUpdateStatus = {
  state: 'none',
  progress: null,
  version: null,
  detail: 'No desktop update available.',
  installable: false,
};

const UNCHECKED: MachineUpdateStatus = {
  ...NEWEST,
  detail: 'Desktop updates haven’t been checked yet.',
};

interface CheckedOffer {
  readonly status: MachineUpdateStatus;
  readonly offer: MachineUpdateOffer | null;
}

function unavailable(status = NEWEST): CheckedOffer {
  return { status, offer: null };
}

function offerIdentity(offer: MachineUpdateOffer): string {
  const artifacts = offer.artifacts.map(({ kind, platform, arch, file, size, sha256 }) =>
    JSON.stringify([kind, platform, arch, file, size, sha256]),
  );
  const identity = [offer.version, artifacts.sort()];
  if (offer.notes !== undefined) identity.push(offer.notes);
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

class ProgressMeter {
  readonly #total: number;
  readonly #report: (progress: MachineUpdateProgress | null) => void;
  #received = 0;
  #shown = -1;

  constructor(total: number, report: (progress: MachineUpdateProgress | null) => void) {
    this.#total = total;
    this.#report = report;
    report(total > 0 ? { received: 0, total } : null);
  }

  add(bytes: number): void {
    this.#received += bytes;
    if (this.#total <= 0) return;
    const percent = Math.floor((this.#received * 100) / this.#total);
    if (percent === this.#shown) return;
    this.#shown = percent;
    this.#report({ received: this.#received, total: this.#total });
  }
}

export class UpdateController {
  readonly #options: UpdateControllerOptions;
  readonly #listeners = new Set<Listener>();
  #status: MachineUpdateStatus = UNCHECKED;
  #offer: MachineUpdateOffer | null = null;
  #offered: MachineUpdateStatus | null = null;
  #checking: Promise<MachineUpdateStatus> | null = null;
  #installGeneration = 0;

  constructor(options: UpdateControllerOptions) {
    this.#options = options;
  }

  status(): MachineUpdateStatus {
    return this.#status;
  }

  onChange(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  check(): Promise<MachineUpdateStatus> {
    if (this.#busy()) return Promise.resolve(this.#status);
    this.#checking ??= this.#check(this.#installGeneration).finally(() => {
      this.#checking = null;
    });
    return this.#checking;
  }

  async #check(generation: number): Promise<MachineUpdateStatus> {
    let result: CheckedOffer;
    try {
      result = await this.#looked();
    } catch (cause) {
      log.warn('update.check_failed', { reason: messageOf(cause) });
      if (generation !== this.#installGeneration) return this.#status;
      return this.#checkFailed(cause);
    }
    if (generation !== this.#installGeneration) return this.#status;
    this.#offer = result.offer;
    this.#offered = result.offer === null ? null : result.status;
    return this.#set(result.status);
  }

  #checkFailed(cause: unknown): MachineUpdateStatus {
    const reason = messageOf(cause);
    if (this.#status.state === 'available' && this.#offered !== null && this.#offer !== null) {
      return this.#set({
        ...this.#offered,
        detail: `${this.#offered.detail} Checking again failed: ${reason}`,
      });
    }
    this.#offer = null;
    return this.#set({
      state: 'failed',
      progress: null,
      version: null,
      detail: `Could not look for an update: ${reason}`,
      installable: false,
    });
  }

  async install(expectedOfferId: string): Promise<MachineUpdateStatus> {
    const available = this.#status;
    const pinned = this.#offer;
    if (
      available.state !== 'available' ||
      !available.installable ||
      pinned === null ||
      available.offerId !== expectedOfferId
    ) {
      return this.#status;
    }
    const { version } = pinned;
    this.#installGeneration += 1;
    try {
      this.#set({
        ...available,
        state: 'downloading',
        progress: null,
        detail: `Downloading desktop version ${version}.`,
      });
      const staged = await this.#download(pinned, (progress) => {
        this.#set({
          ...available,
          state: 'downloading',
          progress,
          detail: `Downloading desktop version ${version}.`,
        });
      });
      this.#set({
        ...available,
        state: 'installing',
        progress: null,
        detail: `Installing desktop version ${version}.`,
      });
      await this.#options.apply(staged);
      return this.#status;
    } catch (cause) {
      const cleanupFailed = cause instanceof UpdateCleanupError;
      log.error('update.install_failed', cleanupFailed ? cause.cause : cause, { version });
      return this.#set({
        state: 'failed',
        progress: null,
        version,
        detail: cleanupFailed
          ? cause.message
          : `Version ${version} could not be installed: ${messageOf(cause)}`,
        installable: false,
      });
    }
  }

  #busy(): boolean {
    return this.#status.state === 'downloading' || this.#status.state === 'installing';
  }

  #set(status: MachineUpdateStatus): MachineUpdateStatus {
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
    return status;
  }

  async #looked(): Promise<CheckedOffer> {
    const { platform, arch, version, install } = this.#options;
    const target = updateTargetOf(platform, arch);
    if (target === null) {
      return unavailable({
        ...NEWEST,
        detail: `Updates are not offered for ${platform} on ${arch}.`,
      });
    }
    const server = await this.#options.server();
    if (server === null) {
      return unavailable({
        ...NEWEST,
        detail: 'Connect this computer to your home to get updates.',
      });
    }
    const offer = await readOffer(server, target, this.#options.fetch);
    if (offer === null || !machineUpdateApplies(offer, version)) return unavailable();
    const blocked = install.kind === 'unmanaged' ? install.reason : null;
    return {
      offer,
      status: {
        state: 'available',
        progress: null,
        version: offer.version,
        detail:
          blocked === null
            ? `Version ${offer.version} is ready to install.`
            : `Version ${offer.version} is available. ${blocked}`,
        installable: blocked === null,
        offerId: offerIdentity(offer),
        ...(offer.notes === undefined ? {} : { notes: offer.notes }),
      },
    };
  }

  async #download(
    pinned: MachineUpdateOffer,
    report: (progress: MachineUpdateProgress | null) => void,
  ): Promise<StagedUpdate> {
    const { platform, arch } = this.#options;
    const server = await this.#options.server();
    const target = updateTargetOf(platform, arch);
    if (server === null || target === null) {
      throw new UpdateInstallError(
        'asking the home for the files',
        'this computer is not connected',
      );
    }
    const offer = await readOffer(server, target, this.#options.fetch);
    if (offer === null) {
      throw new UpdateInstallError(
        'asking the home for the files',
        'the update is no longer stored',
      );
    }
    if (offerIdentity(pinned) !== offerIdentity(offer)) {
      throw new UpdateInstallError(
        'refreshing the download',
        'the offered update changed. Check for updates and confirm again',
      );
    }
    const directory = join(this.#options.stagingDirectory, offer.version);
    const total = offer.artifacts.reduce((sum, { size }) => sum + size, 0);
    const meter = new ProgressMeter(total, report);
    const files = new Map<MachineUpdateKind, string>();
    for (const artifact of offer.artifacts) {
      files.set(
        artifact.kind,
        await downloadArtifact(
          artifact,
          { serverUrl: server.url, directory },
          this.#options.fetch,
          (bytes) => {
            meter.add(bytes);
          },
        ),
      );
    }
    return { version: offer.version, directory, files };
  }
}
