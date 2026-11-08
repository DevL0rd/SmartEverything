import { appPlatform } from '../design/platform';
import { useDeveloperOn } from '../developer/panel-read';
import { useAvailability, useIsOwner } from '../store/selectors';
import type { SettingEnv } from './types';

export function useSettingEnv(): SettingEnv {
  return {
    owner: useIsOwner(),
    platform: appPlatform(),
    availability: useAvailability(),
    developer: useDeveloperOn(),
  };
}
