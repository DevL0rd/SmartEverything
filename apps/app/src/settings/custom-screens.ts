import type { ComponentType } from 'react';
import { APP_UPDATES_PAGE, AppUpdatesScreen } from '../features/app-updates';
import { AiExtensionsRoute } from '../features/assistant';
import { CamerasSettingsScreen, RemoteViewingScreen } from '../features/cameras';
import { DeveloperScreen, RuntimeLogsScreen } from '../features/developer';
import { PUSH_RELEASES_PAGE, PushReleasesScreen } from '../features/hub-updates';
import { BackupSettingsScreen } from '../features/photos/backup';
import { DuplicatesSettingsScreen } from '../features/photos/duplicates';
import { PhotosSettingsScreen } from '../features/photos/settings/screen';
import { DevicesSettingsScreen } from '../features/settings/devices/devices-settings-screen';
import { SetupScreen } from '../features/setup';
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
  developer: DeveloperScreen,
  'developer/logs': RuntimeLogsScreen,
  devices: DevicesSettingsScreen,
  photos: PhotosSettingsScreen,
  'photos/backup': BackupSettingsScreen,
  'photos/duplicates': DuplicatesSettingsScreen,
  setup: SetupScreen,
  'cameras/remote-viewing': RemoteViewingScreen,
  'talk/channels/[channelId]': ChannelEditorScreen,
  [APP_UPDATES_PAGE]: AppUpdatesScreen,
  [PUSH_RELEASES_PAGE]: PushReleasesScreen,
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
