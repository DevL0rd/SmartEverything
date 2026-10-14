import type { ComponentType } from 'react';
import { AiExtensionsRoute } from '../features/assistant';
import { CamerasSettingsScreen, RemoteViewingScreen } from '../features/cameras';
import { ChannelEditorScreen } from '../features/talk';

export const CUSTOM_SETTINGS_SCREENS: Readonly<Record<string, ComponentType>> = {
  'assistant/extensions': AiExtensionsRoute,
  'assistant/extensions/add': AiExtensionsRoute,
  'assistant/extensions/detail': AiExtensionsRoute,
  'assistant/skills': AiExtensionsRoute,
  'assistant/skills/add': AiExtensionsRoute,
  'assistant/skills/detail': AiExtensionsRoute,
  'assistant/skills/updates': AiExtensionsRoute,
  cameras: CamerasSettingsScreen,
  'cameras/remote-viewing': RemoteViewingScreen,
  'talk/channels/[channelId]': ChannelEditorScreen,
};

export function customSettingsScreenId(id: string): string {
  if (CUSTOM_SETTINGS_SCREENS[id] !== undefined) return id;
  const segments = id.split('/');
  const matched = Object.keys(CUSTOM_SETTINGS_SCREENS).find((path) => {
    const parts = path.split('/');
    return (
      parts.length === segments.length &&
      parts.every(
        (part, index) => (part.startsWith('[') && part.endsWith(']')) || part === segments[index],
      )
    );
  });
  return matched ?? id;
}
