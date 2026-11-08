import {
  completeEngine,
  defaultEngine,
  meteredCatalogue,
  meteredEngine,
} from '../openrouter/metered-engine';
import {
  ApiError,
  ENGINE_WRITE,
  CLAUDE_PROVIDER_OPTIONS,
  CODEX_PROVIDER_OPTIONS,
  type AiRuntimeEngineCatalogue,
  type Engine,
  type EngineRequest,
  type Role,
  type ComputerAiRuntime,
  type ComputerRuntimeStatus,
} from '@smarteverything/domain';
import { assertModelAllowed } from '../server/person-scope';
import { computerProviderReadiness, validateComputerEngine } from './engine-validation';
import { computerEngine } from './engine-kind';
import type { Logger } from '@smarteverything/logging';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import type { Store } from '../store/store';
import { background } from '@smarteverything/logging';
const RUNTIMES = ['claude', 'codex'] as const;
export interface EngineUser {
  readonly role: Role;
  readonly profileId: string;
}
export class EngineSelections {
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
  select(profileId: string, request: EngineRequest): Engine {
    const engine = completeEngine(profileId, request, meteredCatalogue(this.store));
    if (request.kind === 'dsh' && request.model_route_id === null && request.model !== null)
      this.assertKnownModel(request.model);
    this.validate(engine, { role: 'owner', profileId });
    return engine;
  }
  private assertKnownModel(model: string): void {
    const row = this.store.aiModels.row(model);
    if (row?.gone_at !== null)
      throw new ApiError('not_found', `The hub doesn’t know a model called ${model}.`);
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
  validate(engine: Engine, user: EngineUser): void {
    ENGINE_WRITE.parse(engine);
    const computer = computerEngine(engine);
    if (computer !== null) validateComputerEngine(this.store, this.directory, computer, user.role);
    if (user.role !== 'owner') assertModelAllowed(this.store, user.profileId, engine.model);
  }
  catalogue(profileId: string, role: Role): AiRuntimeEngineCatalogue {
    return {
      default:
        role === 'owner'
          ? defaultEngine(this.store, profileId)
          : meteredEngine(profileId, { model: null, effort: null }, meteredCatalogue(this.store)),
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
      models: this.store.computerRuntimes.models({ device_id: device.id, runtime }),
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
    background(
      this.directory
        .runtimeModels({ device_id: deviceId, runtime })
        .catch((cause: unknown) => {
          this.log.error('computer.models_discovery_failed', cause, { deviceId, runtime });
        })
        .finally(() => {
          this.refreshing.delete(key);
        }),
      'models.runtime_failed',
    );
  }
}
function unavailableReason(status: ComputerRuntimeStatus, role: Role): string | null {
  if (role !== 'owner') return 'Only the home owner can use Claude or Codex on computers.';
  return computerProviderReadiness(status);
}
