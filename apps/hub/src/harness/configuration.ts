import {
  ApiError,
  deriveHarnessConfigurationHostStatus,
  harnessTargetKey,
  type AiHarnessConfigurationCatalogue,
  type AiHarnessConfigurationReport,
  type AiHarnessConfigurationStoredReport,
  type AiHarnessManifest,
  type AiHarnessConfigurationNotice,
  type HarnessDesiredConfiguration,
} from '@smarteverything/domain';
import { desiredHarnessConfiguration } from '@smarteverything/harness';
import type { HostedRepository } from '../store/host/hosted';
import { HarnessConfigurationStorageError } from '../store/repositories/harness-configuration';
import type { HarnessConnection, HarnessDirectory } from './directory';
import type { HarnessExtensionRows } from './extension-rows';
import { Logger } from '@smarteverything/logging';

export class HarnessConfigurationNotLoadedError extends Error {
  override readonly name = 'HarnessConfigurationNotLoadedError';

  constructor() {
    super('The desired harness configuration is read before the harness started.');
  }
}

export type HarnessConfigurationStore = HostedRepository<
  'harnessConfiguration',
  'record' | 'reports' | 'report'
>;

export class HarnessConfigurationService {
  private readonly listeners = new Set<(notice: AiHarnessConfigurationNotice) => void>();
  private readonly log = new Logger('hub.harness-configuration');
  private recorded: HarnessDesiredConfiguration | null = null;

  constructor(
    private readonly repository: HarnessConfigurationStore,
    private readonly extensions: Pick<HarnessExtensionRows, 'list' | 'builtins'>,
    private readonly directory: HarnessDirectory,
  ) {
    directory.onRegister((connection) => {
      this.push(connection);
      this.changed('host');
    });
    directory.onOffline(() => {
      this.changed('host');
    });
  }

  onChange(listener: (notice: AiHarnessConfigurationNotice) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  async load(): Promise<void> {
    this.recorded = await this.repository.record(this.derive());
  }

  private get current(): HarnessDesiredConfiguration {
    if (this.recorded === null) throw new HarnessConfigurationNotLoadedError();
    return this.recorded;
  }

  private changed(reason: AiHarnessConfigurationNotice['reason']): void {
    const notice: AiHarnessConfigurationNotice = {
      type: 'ai_harness_configuration',
      reason,
      revision: this.current.revision,
    };
    for (const listener of this.listeners) {
      try {
        listener(notice);
      } catch (cause) {
        this.log.error('configuration.observer_failed', cause);
      }
    }
  }

  notifySettings(): void {
    this.changed('desired');
  }

  desired(): HarnessDesiredConfiguration {
    return this.current;
  }

  async refresh(): Promise<void> {
    const next = this.derive();
    if (next.revision === this.current.revision) return;
    this.recorded = await this.repository.record(next);
    for (const host of this.directory.list()) this.push(this.directory.registered(host.target));
    this.changed('desired');
  }

  private derive(): HarnessDesiredConfiguration {
    const rows = this.extensions.list().filter((row) => row.enabled);
    const assetsOf = (
      kind: 'skill' | 'plugin',
    ): { id: string; version: string; executes: boolean }[] =>
      rows
        .filter((row) => row.kind === kind)
        .flatMap((row) =>
          row.version === null
            ? []
            : [{ id: row.id, version: row.version, executes: row.executes && row.confirmed }],
        );
    return desiredHarnessConfiguration({
      selections: this.extensions.builtins(),
      skills: assetsOf('skill'),
      plugins: assetsOf('plugin'),
    });
  }

  async catalogue(
    role: 'owner' | 'member',
    clientId: string,
  ): Promise<AiHarnessConfigurationCatalogue> {
    const reports = await this.repository.reports();
    return {
      desired: this.current,
      hosts: this.directory
        .visible(role, clientId)
        .map((host) =>
          deriveHarnessConfigurationHostStatus(
            host,
            this.current,
            reports.find(
              (report) => harnessTargetKey(report.target) === harnessTargetKey(host.target),
            ) ?? null,
          ),
        ),
    };
  }

  async report(
    report: AiHarnessConfigurationReport,
    manifest: AiHarnessManifest,
    connection: HarnessConnection,
  ): Promise<AiHarnessConfigurationStoredReport> {
    if (connection.host.configuration_sync !== true)
      throw new ApiError('forbidden', 'This host did not negotiate configuration synchronization.');
    const current = this.directory.get(connection.host.target);
    if (current !== connection)
      throw new ApiError('conflict', 'This report belongs to a replaced configuration connection.');
    const stored = await storageResult(() => this.repository.report(report, connection.host));
    if (
      report.pending_revision === undefined &&
      !report.readiness.some((entry) => entry.state === 'pending')
    )
      this.directory.updateManifest(connection.host, manifest);
    this.changed('report');
    return stored;
  }

  private push(connection: HarnessConnection): void {
    if (!connection.host.online || connection.host.configuration_sync !== true) return;
    connection.configure?.(this.current);
  }
}

async function storageResult<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof HarnessConfigurationStorageError)
      throw new ApiError('conflict', cause.reason);
    throw cause;
  }
}
