import { useEffect } from 'react';
import { background } from '@smarteverything/logging';
import { useLocalSearchParams } from 'expo-router';
import { highlights } from '../components/highlight-anchors';
import { anchorKey } from '../components/highlight-keys';
import type { SettingDefinition } from './types';

export function useSettingsFocus(settings: readonly SettingDefinition[]): void {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const listed = settings.find((setting) => setting.id === focus);
  const settingId = listed?.control === 'listed' ? listed.in : focus;

  useEffect(() => {
    if (settingId === undefined) return undefined;
    const leaving = new AbortController();
    background(
      highlights.request([anchorKey.setting(settingId)], leaving.signal),
      'settings.highlight_failed',
    );
    return (): void => {
      leaving.abort();
    };
  }, [settingId]);
}
