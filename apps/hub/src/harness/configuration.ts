import {
  ApiError,
  AI_HARNESS_CONFIGURATION_REPLACE,
  deriveHarnessConfigurationHostStatus,
  harnessTargetKey,
  type AiHarnessConfigurationCatalogue,
  type AiHarnessConfigurationReport,
  type AiHarnessConfigurationStoredReport,
  type AiHarnessManifest,
  type AiHarnessConfigurationNotice,
  type HarnessDesiredConfiguration,
  type HarnessDesiredEntry,
  type JsonValue,
} from '@smarteverything/domain';
import { defaultHarnessBuiltins, upgradeHarnessBuiltins } from '@smarteverything/harness';
import {
  HarnessConfigurationStorageError,
  type HarnessConfigurationRepository,
} from '../store/repositories/harness-configuration';
import type { HarnessConnection, HarnessDirectory } from './directory';
import { Logger } from '@smarteverything/logging';

const PRIVATE_CONFIGURATION_KEY =
  /(?:token|secret|password|credential|authorization|api[_-]?key|cookie|subscription)/i;

export class HarnessConfigurationService {
  private readonly listeners = new Set<(notice: AiHarnessConfigurationNotice) => void>();
  private readonly log = new Logger('hub.harness-configuration');
  constructor(
    private readonly repository: HarnessConfigurationRepository,
    private readonly directory: HarnessDirectory,
  ) {
    const current = repository.desired();
    if (current.revision === 'initial' && current.entries.length === 0)
      repository.replace({
        expected_revision: current.revision,
        configuration: defaultHarnessBuiltins(),
      });
    else {
      const upgraded = upgradeHarnessBuiltins(current);
      if (upgraded !== current)
        repository.replace({ expected_revision: current.revision, configuration: upgraded });
    }
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

  private changed(reason: AiHarnessConfigurationNotice['reason']): void {
    const notice: AiHarnessConfigurationNotice = {
      type: 'ai_harness_configuration',
      reason,
      revision: this.desired().revision,
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
    return this.repository.desired();
  }

  catalogue(role: 'owner' | 'member', clientId: string): AiHarnessConfigurationCatalogue {
    const desired = this.desired();
    const reports = this.repository.reports();
    return {
      desired,
      hosts: this.directory
        .visible(role, clientId)
        .map((host) =>
          deriveHarnessConfigurationHostStatus(
            host,
            desired,
            reports.find(
              (report) => harnessTargetKey(report.target) === harnessTargetKey(host.target),
            ) ?? null,
          ),
        ),
    };
  }

  replace(input: unknown, role: 'owner' | 'member'): HarnessDesiredConfiguration {
    if (role !== 'owner')
      throw new ApiError('forbidden', 'Only an owner may replace shared extensions.');
    const request = AI_HARNESS_CONFIGURATION_REPLACE.parse(input);
    for (const entry of request.configuration.entries) requirePublicEntry(entry);
    const previous = this.desired();
    const desired = storageResult(() => this.repository.replace(request));
    if (desired.revision !== previous.revision) {
      for (const host of this.directory.list()) this.push(this.directory.registered(host.target));
      this.changed('desired');
    }
    return desired;
  }

  report(
    report: AiHarnessConfigurationReport,
    manifest: AiHarnessManifest,
    connection: HarnessConnection,
  ): AiHarnessConfigurationStoredReport {
    if (connection.host.configuration_sync !== true)
      throw new ApiError('forbidden', 'This host did not negotiate configuration synchronization.');
    const current = this.directory.get(connection.host.target);
    if (current !== connection)
      throw new ApiError('conflict', 'This report belongs to a replaced configuration connection.');
    requireCompatibleReadiness(report, manifest, connection);
    const stored = storageResult(() => this.repository.report(report, connection.host));
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
    connection.configure?.(this.desired());
  }
}

function storageResult<T>(work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof HarnessConfigurationStorageError)
      throw new ApiError('conflict', cause.reason);
    throw cause;
  }
}

function requirePublicConfiguration(value: JsonValue): void {
  if (configurationArray(value)) {
    for (const entry of value) requirePublicConfiguration(entry);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries<JsonValue>(value)) {
    if (PRIVATE_CONFIGURATION_KEY.test(key))
      throw new ApiError(
        'invalid_request',
        'Shared extension settings cannot contain host credentials.',
      );
    requirePublicConfiguration(entry);
  }
}

function requireCompatibleReadiness(
  report: AiHarnessConfigurationReport,
  manifest: AiHarnessManifest,
  connection: HarnessConnection,
): void {
  for (const readiness of report.readiness) {
    if (readiness.state !== 'ready') continue;
    const metadata = readiness.installedMetadata;
    if (
      metadata === undefined ||
      metadata === null ||
      !metadata.platforms.includes(connection.host.platform) ||
      (connection.host.target.kind === 'server' && !metadata.server_safe) ||
      metadata.dsh_version !== manifest.composition.dsh_version ||
      metadata.runtime_version !== manifest.revision
    )
      throw new ApiError(
        'forbidden',
        'Ready extension metadata does not match this host composition.',
      );
  }
}

function configurationArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function requirePublicEntry(entry: HarnessDesiredEntry): void {
  requirePublicConfiguration(entry.config);
  if (entry.metadata === undefined) return;
  const sources = [
    entry.metadata.source,
    ...entry.metadata.skill_assets.map((asset) => asset.source),
  ];
  for (const source of sources) {
    if (source.kind !== 'artifact') continue;
    const url = new URL(source.url);
    if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '')
      throw new ApiError(
        'invalid_request',
        'Shared artifact identities require public URLs without credentials, query strings or fragments.',
      );
  }
}
