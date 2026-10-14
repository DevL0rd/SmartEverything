import { OwnEngineSelections } from '../harness/own-selection';
import type { HarnessService } from '../harness/service';
import {
  ApiError,
  DEFAULT_ENGINE,
  ENGINE_WRITE,
  CLAUDE_PROVIDER_OPTIONS,
  CODEX_PROVIDER_OPTIONS,
  type AiRuntimeEngineCatalogue,
  type Engine,
  type Role,
  type ComputerAiRuntime,
  type ComputerRuntimeStatus,
} from '@smarteverything/domain';
import { validateComputerEngine } from './engine-validation';
import type { Logger } from '@smarteverything/logging';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import type { Store } from '../store/store';
const RUNTIMES = ['claude', 'codex'] as const;
export class EngineSelections {
  private own: OwnEngineSelections | null = null;
  private readonly refreshing = new Set<string>();
  private readonly leave: () => void;
  constructor(
    private readonly store: Store,
    private readonly directory: ComputerAiDirectory,
    private readonly log: Logger,
  ) {
    this.leave = directory.runtimes.onChange((status) => {
      if (
        status.online &&
        status.settings.settings.provider.enabled &&
        status.capabilities.operations.includes('models')
      )
        this.refresh(status.device_id, status.runtime);
    });
  }
  stop(): void {
    this.leave();
  }
  attachHarness(service: HarnessService): void {
    this.own = new OwnEngineSelections(service);
  }
  select(profileId: string, engine: Engine, background = false): Engine {
    this.validate(engine, 'owner');
    if (engine.kind !== 'openrouter') return engine;
    if (this.own === null)
      throw new ApiError('conflict', 'SmartEverything model routes are starting.');
    return this.own.select(profileId, engine, background);
  }
  default(profileId: string, background = false): Engine {
    const engine = this.select(
      profileId,
      this.store.aiEngineDefaults.read() ?? DEFAULT_ENGINE,
      background,
    );
    if (engine.kind !== 'dsh') return engine;
    if (this.own === null)
      throw new ApiError('conflict', 'SmartEverything model routes are starting.');
    return this.own.default(profileId, engine, background);
  }
  hasComputerProvider(runtime: ComputerAiRuntime = 'claude'): boolean {
    return this.store.devices
      .list()
      .some(
        (device) =>
          device.kind === 'computer' &&
          this.store.computerRuntimes.settings({ device_id: device.id, runtime }).settings.provider
            .enabled,
      );
  }
  validate(engine: Engine, role: Role): void {
    ENGINE_WRITE.parse(engine);
    if (engine.kind === 'dsh') return;
    if (engine.kind !== 'openrouter') {
      validateComputerEngine(this.store, this.directory, engine, role);
      return;
    }
    const model = engine.model ?? this.store.aiModels.settings().default_model;
    if (model === 'smarteverything/unavailable-computer-engine')
      throw new ApiError(
        'conflict',
        'Update this app before using the unavailable computer engine.',
      );
    const supplier = model.startsWith('anthropic/')
      ? 'claude'
      : model.startsWith('openai/')
        ? 'codex'
        : null;
    if (supplier !== null && this.hasComputerProvider(supplier))
      throw new ApiError(
        'conflict',
        `Choose an explicit supported ${supplier} subscription supplier. There is no paid fallback.`,
      );
  }
  catalogue(role: Role): AiRuntimeEngineCatalogue {
    return {
      default: role === 'owner' ? this.store.aiEngineDefaults.read() : null,
      preferences: this.store.aiRuntimeProvider.preferences(),
      computers: this.store.devices
        .list()
        .filter((device) => device.kind === 'computer')
        .flatMap((device) => RUNTIMES.map((runtime) => this.computer(device, runtime, role))),
    };
  }
  private computer(
    device: { readonly id: string; readonly name: string },
    runtime: ComputerAiRuntime,
    role: Role,
  ): AiRuntimeEngineCatalogue['computers'][number] {
    const status = this.directory.runtimeStatus({ device_id: device.id, runtime });
    const reason = unavailableReason(status, role);
    const base = {
      device_id: device.id,
      name: device.name,
      online: status.online,
      enabled: status.settings.settings.provider.enabled,
      reason,
      capabilities: status.capabilities,
      models: this.store.computerRuntimes
        .models({ device_id: device.id, runtime })
        .map((model) => ({
          ...model,
          available: reason === null && model.available,
          reason: reason ?? model.reason,
        })),
    };
    return status.settings.runtime === 'claude'
      ? {
          ...base,
          runtime: 'claude',
          provider_options:
            role === 'owner'
              ? status.settings.settings.provider.options
              : CLAUDE_PROVIDER_OPTIONS.parse({}),
        }
      : {
          ...base,
          runtime: 'codex',
          provider_options:
            role === 'owner'
              ? status.settings.settings.provider.options
              : CODEX_PROVIDER_OPTIONS.parse({}),
        };
  }
  private refresh(deviceId: string, runtime: ComputerAiRuntime): void {
    const key = JSON.stringify([deviceId, runtime]);
    if (this.refreshing.has(key)) return;
    this.refreshing.add(key);
    void this.directory
      .runtimeModels({ device_id: deviceId, runtime })
      .catch((cause: unknown) => {
        this.log.error('computer.models_discovery_failed', cause, { deviceId, runtime });
      })
      .finally(() => {
        this.refreshing.delete(key);
      });
  }
}
function unavailableReason(status: ComputerRuntimeStatus, role: Role): string | null {
  if (role !== 'owner') return 'Only the owner may run native computer work.';
  if (!status.online) return 'The supplying computer is offline.';
  if (!status.settings.settings.provider.enabled)
    return 'The provider is disabled on this computer.';
  return status.capabilities.provider_reason;
}
