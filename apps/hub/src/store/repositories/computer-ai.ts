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

const ROW = z.strictObject({
  settings: SQL_JSON.pipe(COMPUTER_AI_SETTINGS),
  capabilities: SQL_JSON.pipe(COMPUTER_AI_CAPABILITIES).nullable(),
  models: SQL_JSON.pipe(z.array(COMPUTER_AI_MODEL)),
});
export class ComputerAiRepository {
  constructor(private readonly context: StoreContext) {}

  settings(deviceId: string): ComputerAiSettings {
    return this.row(deviceId)?.settings ?? DEFAULT_COMPUTER_AI_SETTINGS;
  }

  capabilities(deviceId: string): ComputerAiCapabilities | null {
    return this.row(deviceId)?.capabilities ?? null;
  }

  models(deviceId: string): ComputerAiModel[] {
    return this.row(deviceId)?.models ?? [];
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

  initialiseLocal(deviceId: string, autoLink: boolean): ComputerAiSettings {
    if (this.row(deviceId) !== undefined) return this.settings(deviceId);
    return this.saveSettings(deviceId, {
      ...DEFAULT_COMPUTER_AI_SETTINGS,
      control: { enabled: true, auto_link: autoLink, mcp_areas: null },
    });
  }

  cache(
    deviceId: string,
    capabilities: ComputerAiCapabilities,
    models: readonly ComputerAiModel[],
  ): void {
    this.context.write(() => {
      this.saveSettings(deviceId, this.settings(deviceId));
      this.context.sql.run(
        'cache computer AI discovery',
        `update computer_ai set capabilities = $capabilities, models = $models, updated_at = $now where device_id = $deviceId and runtime = 'claude'`,
        {
          deviceId,
          capabilities: jsonText(COMPUTER_AI_CAPABILITIES.parse(capabilities)),
          models: jsonText(z.array(COMPUTER_AI_MODEL).parse(models)),
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
