import {
  isNewerVersion,
  type DesktopServer,
  type MachineUpdateKind,
  type MachineUpdateStatus,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { join } from 'node:path';
import type { InstallKind } from './install-kind.js';
import { downloadArtifact } from './update-download.js';
import { UpdateInstallError } from './update-errors.js';
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
  version: null,
  detail: 'You have the newest version.',
  installable: false,
};

export class UpdateController {
  readonly #options: UpdateControllerOptions;
  readonly #listeners = new Set<Listener>();
  #status: MachineUpdateStatus = NEWEST;

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

  async check(): Promise<MachineUpdateStatus> {
    if (this.#busy()) return this.#status;
    try {
      return this.#set(await this.#looked());
    } catch (cause) {
      log.warn('update.check_failed', { reason: messageOf(cause) });
      return this.#set({
        state: 'failed',
        version: null,
        detail: `Could not look for an update: ${messageOf(cause)}`,
        installable: false,
      });
    }
  }

  async install(): Promise<MachineUpdateStatus> {
    const available = this.#status;
    if (available.state !== 'available' || !available.installable || available.version === null) {
      return this.#status;
    }
    const { version } = available;
    try {
      this.#set({ ...available, state: 'downloading', detail: `Downloading version ${version}.` });
      const staged = await this.#download();
      this.#set({ ...available, state: 'installing', detail: `Installing version ${version}.` });
      await this.#options.apply(staged);
      return this.#status;
    } catch (cause) {
      log.error('update.install_failed', cause, { version });
      return this.#set({
        state: 'failed',
        version,
        detail: `Version ${version} could not be installed: ${messageOf(cause)}`,
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

  async #looked(): Promise<MachineUpdateStatus> {
    const { platform, arch, version, install } = this.#options;
    const target = updateTargetOf(platform, arch);
    if (target === null) {
      return { ...NEWEST, detail: `Updates are not offered for ${platform} on ${arch}.` };
    }
    const server = await this.#options.server();
    if (server === null) {
      return { ...NEWEST, detail: 'Connect this computer to your home to get updates.' };
    }
    const offer = await readOffer(server, target, this.#options.fetch);
    if (offer === null || !isNewerVersion(offer.version, version)) return NEWEST;
    const blocked = install.kind === 'unmanaged' ? install.reason : null;
    return {
      state: 'available',
      version: offer.version,
      detail:
        blocked === null
          ? `Version ${offer.version} is ready to install.`
          : `Version ${offer.version} is available. ${blocked}`,
      installable: blocked === null,
    };
  }

  async #download(): Promise<StagedUpdate> {
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
    const directory = join(this.#options.stagingDirectory, offer.version);
    const files = new Map<MachineUpdateKind, string>();
    for (const artifact of offer.artifacts) {
      files.set(
        artifact.kind,
        await downloadArtifact(artifact, server.url, directory, this.#options.fetch),
      );
    }
    return { version: offer.version, directory, files };
  }
}
