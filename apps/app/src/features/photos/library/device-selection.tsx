import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import type { MediaSelectionControls } from '../../../components/media-grid/selection';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useEscape } from '../../../components/use-escape';
import { attachFiles, useLastChat } from '../../assistant';
import { useBackupHandle } from '../backup/handle';
import { useBackupStatus } from '../backup/model/status';
import { PHOTOS_BACKUP_SETTINGS_HREF } from '../components/photos-frame';
import type { LocalMediaItem } from '../local/types';
import { BarAction } from './library-action-row';
import { NOTHING_PICKED } from './library-selection';
import { localFileOf } from './local-ask';
import { pickedLocalItems, pickedLocalText } from './local-scope';
import {
  SelectionActions,
  SelectionGroup,
  SelectionSummary,
  SelectionSurface,
} from '../components/selection-surface';

export interface DeviceSelectionProps {
  readonly controls: MediaSelectionControls;
  readonly tiles: readonly MediaTile[];
  readonly items: readonly LocalMediaItem[];
  readonly compact: boolean;
}

function askAboutLocal(item: LocalMediaItem, chatId: string): Promise<void> {
  return localFileOf(item).then((file) => {
    attachFiles([file], chatId);
    router.push(href.assistantChat(chatId));
  });
}

interface BackupAction {
  readonly label: string;
  readonly short: string;
  readonly href: typeof PHOTOS_BACKUP_SETTINGS_HREF | null;
  readonly onPress: () => void;
}

function useBackupAction(): BackupAction {
  const handle = useBackupHandle();
  const phase = useBackupStatus().phase;
  if (handle === null || phase === 'off' || phase === 'unavailable' || phase === 'denied') {
    return {
      label: 'Turn on backup',
      short: 'Backup',
      href: PHOTOS_BACKUP_SETTINGS_HREF,
      onPress: (): void => {
        router.push(PHOTOS_BACKUP_SETTINGS_HREF);
      },
    };
  }
  return {
    label: 'Back up now',
    short: 'Back up',
    href: null,
    onPress: (): void => {
      background(handle.runner.request(), 'photos.device.backup_now_failed');
      notify({ message: 'Backing up this device', tone: 'positive' });
    },
  };
}

function BackUpNow(): ReactNode {
  const action = useBackupAction();
  return action.href === null ? (
    <Button label={action.label} icon="upload" variant="tonal" onPress={action.onPress} />
  ) : (
    <Button label={action.label} icon="upload" variant="tonal" href={action.href} />
  );
}

function useAskAbout(picked: readonly LocalMediaItem[]): (() => void) | null {
  const last = useLastChat();
  const chatId = last.kind === 'open' ? last.chatId : null;
  const only = picked.length === 1 ? picked[0] : undefined;
  if (only === undefined || chatId === null) return null;
  return (): void => {
    askAboutLocal(only, chatId).catch((error: unknown) => {
      notify({ message: 'Could not ask about it in the chat', error, tone: 'critical' });
    });
  };
}

function AskAboutIt({ picked }: { readonly picked: readonly LocalMediaItem[] }): ReactNode {
  const ask = useAskAbout(picked);
  if (ask === null) return null;
  return <Button label="Ask about it" icon="sparkles" variant="outlined" onPress={ask} />;
}

export function DeviceSelection({ controls, tiles, items, compact }: DeviceSelectionProps): ReactNode {
  useEscape(controls.selection.active, controls.clear);
  const { ids } = controls.selection;
  const picked = pickedLocalItems(ids, items);
  return (
    <SelectionSurface>
      <SelectionSummary>
        <IconButton
          icon="close"
          label="Clear the selection"
          tone="onPrimaryContainer"
          onPress={controls.clear}
        />
        <Text
          variant="title-3"
          tone="onPrimaryContainer"
          className="min-w-0 shrink tabular-nums"
          numberOfLines={1}
        >
          {picked.length === 0 ? NOTHING_PICKED : pickedLocalText(picked.length)}
        </Text>
        {tiles.some((tile) => !ids.has(tile.id)) ? (
          <Button label="Select all" variant="text" onPress={controls.all} />
        ) : null}
      </SelectionSummary>
      {compact || picked.length === 0 ? null : (
        <SelectionActions>
          <SelectionGroup>
            <BackUpNow />
            <AskAboutIt picked={picked} />
          </SelectionGroup>
        </SelectionActions>
      )}
    </SelectionSurface>
  );
}

export function DeviceActionBar({ controls, items }: DeviceSelectionProps): ReactNode {
  const picked = pickedLocalItems(controls.selection.ids, items);
  const backup = useBackupAction();
  const ask = useAskAbout(picked);
  return (
    <View className="flex-row">
      <BarAction icon="upload" label={backup.short} disabled={false} onPress={backup.onPress} />
      {ask === null ? null : (
        <BarAction icon="sparkles" label="Ask about it" disabled={false} onPress={ask} />
      )}
    </View>
  );
}
