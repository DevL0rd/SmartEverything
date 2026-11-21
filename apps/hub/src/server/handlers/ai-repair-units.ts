import { AI_REPAIR_SETTINGS, type AiRepairSettings } from '@smarteverything/domain';
import { z } from 'zod';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';

const SETTING = 'ai-repair';
const ENABLED_AT = 'ai-repair-enabled-at';
const START = z.strictObject({ at: z.iso.datetime() });
const OFF: AiRepairSettings = { enabled: false };

export interface AiRepairState {
  readonly settings: AiRepairSettings;
  readonly enabledAt: string | null;
}

function settingsIn(store: HostStore): AiRepairSettings {
  const saved = store.settingsKv.read(SETTING);
  return saved === null ? OFF : AI_REPAIR_SETTINGS.parse(saved);
}

export const AI_REPAIR_READ_UNITS = {
  aiRepairState: storeUnit((store, _input: null): AiRepairState => {
    const saved = store.settingsKv.read(ENABLED_AT);
    return {
      settings: settingsIn(store),
      enabledAt: saved === null ? null : START.parse(saved).at,
    };
  }),
} as const;

export const AI_REPAIR_WRITE_UNITS = {
  aiRepairSettingsSave: storeUnit((store, body: AiRepairSettings): AiRepairSettings => {
    if (body.enabled && !settingsIn(store).enabled)
      store.settingsKv.save(ENABLED_AT, { at: store.now().toISOString() });
    store.settingsKv.save(SETTING, body);
    return body;
  }),
} as const;
