import { z } from 'zod';
import {
  COMPUTER_AI_MODEL,
  COMPUTER_AI_CAPABILITIES,
  COMPUTER_RUNTIME_SETTINGS,
  COMPUTER_RUNTIME_CAPABILITIES,
  COMPUTER_RUNTIME_MODEL,
  DEFAULT_CODEX_AI_SETTINGS,
  DEFAULT_COMPUTER_AI_SETTINGS,
  type ComputerRuntimeTarget,
  type ComputerRuntimeSettings,
  type ComputerRuntimeCapabilities,
  type ComputerRuntimeModel,
} from '@smarteverything/domain';
import { ComputerNativeMcpPolicyRepository } from './computer-native-mcp-policy';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';

const ROW = z.strictObject({
  settings: SQL_JSON,
  capabilities: SQL_JSON.nullable(),
  models: SQL_JSON,
});
export class ComputerRuntimesRepository {
  constructor(private readonly context: StoreContext) {}
  settings(target: ComputerRuntimeTarget): ComputerRuntimeSettings {
    const row = this.row(target);
    if (row === undefined)
      return target.runtime === 'claude'
        ? { runtime: 'claude', settings: DEFAULT_COMPUTER_AI_SETTINGS }
        : { runtime: 'codex', settings: DEFAULT_CODEX_AI_SETTINGS };
    return COMPUTER_RUNTIME_SETTINGS.parse({ runtime: target.runtime, settings: row.settings });
  }
  capabilities(target: ComputerRuntimeTarget): ComputerRuntimeCapabilities | null {
    const value = this.row(target)?.capabilities;
    if (value === null || value === undefined) return null;
    if (target.runtime === 'claude')
      return COMPUTER_RUNTIME_CAPABILITIES.parse({
        capability_revision: 'claude-v1',
        authentication: 'unknown',
        subscription: 'unverified',
        input_modalities: [],
        local_features: {},
        ...z.record(z.string(), z.unknown()).parse(value),
      });
    return COMPUTER_RUNTIME_CAPABILITIES.parse(value);
  }
  models(target: ComputerRuntimeTarget): ComputerRuntimeModel[] {
    const value = this.row(target)?.models;
    if (value === undefined) return [];
    const models = z.array(z.record(z.string(), z.unknown())).parse(value);
    return models.map((model) =>
      COMPUTER_RUNTIME_MODEL.parse({ runtime: target.runtime, input_modalities: [], ...model }),
    );
  }
  saveSettings(
    target: ComputerRuntimeTarget,
    value: ComputerRuntimeSettings,
  ): ComputerRuntimeSettings {
    const parsed = COMPUTER_RUNTIME_SETTINGS.parse(value);
    if (parsed.runtime !== target.runtime)
      throw new RuntimeStorageBindingError(target.runtime, parsed.runtime);
    return this.context.write(() => {
      new ComputerNativeMcpPolicyRepository(this.context).syncLegacy(
        target,
        parsed.settings.control,
      );
      this.context.sql.run(
        'save computer runtime settings',
        `insert into computer_ai(device_id,runtime,settings,updated_at) values($device,$runtime,$settings,$now) on conflict(device_id,runtime) do update set settings=excluded.settings,updated_at=excluded.updated_at`,
        {
          device: target.device_id,
          runtime: target.runtime,
          settings: jsonText(parsed.settings),
          now: this.context.now(),
        },
      );
      return parsed;
    });
  }
  cache(
    target: ComputerRuntimeTarget,
    capabilities: ComputerRuntimeCapabilities,
    models: readonly ComputerRuntimeModel[],
  ): void {
    const parsed = z.array(COMPUTER_RUNTIME_MODEL).parse(models);
    if (
      parsed.some(
        (model) => model.runtime !== target.runtime || model.device_id !== target.device_id,
      )
    )
      throw new RuntimeStorageBindingError(target.runtime, 'different model target');
    this.context.write(() => {
      this.saveSettings(target, this.settings(target));
      this.context.sql.run(
        'cache runtime discovery',
        'update computer_ai set capabilities=$capabilities,models=$models,updated_at=$now where device_id=$device and runtime=$runtime',
        {
          device: target.device_id,
          runtime: target.runtime,
          capabilities: jsonText(
            target.runtime === 'claude'
              ? COMPUTER_AI_CAPABILITIES.strip().parse(capabilities)
              : COMPUTER_RUNTIME_CAPABILITIES.parse(capabilities),
          ),
          models: jsonText(
            target.runtime === 'claude'
              ? parsed.map((model) => COMPUTER_AI_MODEL.strip().parse(model))
              : parsed,
          ),
          now: this.context.now(),
        },
      );
    });
  }
  private row(target: ComputerRuntimeTarget): z.infer<typeof ROW> | undefined {
    return this.context.sql.get(
      ROW,
      'select settings,capabilities,models from computer_ai where device_id=$device and runtime=$runtime',
      { device: target.device_id, runtime: target.runtime },
    );
  }
}
class RuntimeStorageBindingError extends Error {
  override readonly name = 'RuntimeStorageBindingError';
  constructor(
    readonly expected: string,
    readonly received: string,
  ) {
    super(`Runtime storage expected ${expected}; received ${received}.`);
  }
}
