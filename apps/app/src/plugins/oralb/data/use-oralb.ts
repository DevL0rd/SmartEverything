import { ORALB_SETTINGS, type OralbSettings } from '@smarteverything/domain';
import { useBrushView } from '../../toothbrush/data/brush-data';

const DEFAULTS = ORALB_SETTINGS.parse({});

export interface OralbConfig {
  readonly oralb: OralbSettings;
  readonly consent: boolean;
}

export function useOralbConfig(deviceId: string): OralbConfig {
  const settings = useBrushView(deviceId, 'settings');
  const value = settings.data?.settings ?? null;
  return { oralb: value?.oralb ?? DEFAULTS, consent: value?.consent ?? false };
}

export function useOralbSettings(deviceId: string): OralbSettings {
  return useOralbConfig(deviceId).oralb;
}
