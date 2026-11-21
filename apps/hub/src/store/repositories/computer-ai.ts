import {
  COMPUTER_AI_SETTINGS,
  COMPUTER_AI_CAPABILITIES,
  COMPUTER_AI_MODEL,
  DEFAULT_COMPUTER_AI_SETTINGS,
  type ComputerAiSettings,
  type ComputerAiCapabilities,
  type ComputerAiModel,
} from '@smarteverything/domain';
import { z } from 'zod';
import { ComputerNativeMcpPolicyRepository } from './computer-native-mcp-policy';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';
import type { StoredComputerAi } from './computer-runtimes';

const ROW = z.strictObject({
  settings: SQL_JSON,
  capabilities: SQL_JSON.nullable(),
  models: SQL_JSON,
});

export function aiSettingsOf(row: StoredComputerAi | undefined): ComputerAiSettings {
  return row === undefined
    ? DEFAULT_COMPUTER_AI_SETTINGS
    : COMPUTER_AI_SETTINGS.parse(row.settings);
}

export function aiCapabilitiesOf(row: StoredComputerAi | undefined): ComputerAiCapabilities | null {
  const value = row?.capabilities;
  return value === null || value === undefined ? null : COMPUTER_AI_CAPABILITIES.parse(value);
}

export function aiModelsOf(row: StoredComputerAi | undefined): ComputerAiModel[] {
  return row === undefined ? [] : z.array(COMPUTER_AI_MODEL).parse(row.models);
}

export function storedAiDiscovery(
  capabilities: ComputerAiCapabilities,
  models: readonly ComputerAiModel[],
): { readonly capabilities: unknown; readonly models: unknown } {
  return {
    capabilities: COMPUTER_AI_CAPABILITIES.parse(capabilities),
    models: z.array(COMPUTER_AI_MODEL).parse(models),
  };
}

export function localAiSettings(autoLink: boolean): ComputerAiSettings {
  return {
    ...DEFAULT_COMPUTER_AI_SETTINGS,
    control: { enabled: true, auto_link: autoLink, mcp_areas: null },
  };
}

export class ComputerAiRepository {
  constructor(private readonly context: StoreContext) {}

  settings(deviceId: string): ComputerAiSettings {
    return aiSettingsOf(this.row(deviceId));
  }

  capabilities(deviceId: string): ComputerAiCapabilities | null {
    return aiCapabilitiesOf(this.row(deviceId));
  }

  models(deviceId: string): ComputerAiModel[] {
    return aiModelsOf(this.row(deviceId));
  }

  saveSettings(deviceId: string, settings: ComputerAiSettings): ComputerAiSettings {
    const parsed = COMPUTER_AI_SETTINGS.parse(settings);
    return this.context.write(() => {
      new ComputerNativeMcpPolicyRepository(this.context).syncLegacy(
        { device_id: deviceId, runtime: 'claude' },
        parsed.control,
      );
      this.context.sql.run(
        'save computer AI settings',
        `insert into computer_ai (device_id, runtime, settings, updated_at) values ($deviceId, 'claude', $settings, $now)
       on conflict(device_id,runtime) do update set settings = excluded.settings, updated_at = excluded.updated_at`,
        { deviceId, settings: jsonText(parsed), now: this.context.now() },
      );
      return parsed;
    });
  }

  cache(
    deviceId: string,
    capabilities: ComputerAiCapabilities,
    models: readonly ComputerAiModel[],
  ): void {
    const stored = storedAiDiscovery(capabilities, models);
    this.context.write(() => {
      this.saveSettings(deviceId, this.settings(deviceId));
      this.context.sql.run(
        'cache computer AI discovery',
        `update computer_ai set capabilities = $capabilities, models = $models, updated_at = $now where device_id = $deviceId and runtime = 'claude'`,
        {
          deviceId,
          capabilities: jsonText(stored.capabilities),
          models: jsonText(stored.models),
          now: this.context.now(),
        },
      );
    });
  }

  private row(deviceId: string): z.infer<typeof ROW> | undefined {
    return this.context.sql.get(
      ROW,
      `select settings, capabilities, models from computer_ai where device_id = $deviceId and runtime = 'claude'`,
      { deviceId },
    );
  }
}
