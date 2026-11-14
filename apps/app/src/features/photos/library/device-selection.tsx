import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import type { MediaSelectionControls } from '../../../components/media-grid/selection';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useEscape } from '../../../components/use-escape';
import { attachFiles, useLastChat } from '../../assistant';
import { useBackupHandle } from '../backup/handle';
import { useBackupStatus } from '../backup/model/status';
import { PHOTOS_BACKUP_SETTINGS_HREF } from '../components/photos-frame';
import { NO_CHAT_HINT } from '../model/ask-actions';
import type { LocalMediaItem } from '../local/types';
import { localFileOf } from './local-ask';
import { pickedLocalItems, pickedLocalText } from './local-scope';

export interface DeviceSelectionProps {
  readonly controls: MediaSelectionControls;
  readonly items: readonly LocalMediaItem[];
}

function askAboutLocal(item: LocalMediaItem, chatId: string): Promise<void> {
  return localFileOf(item).then((file) => {
    attachFiles([file], chatId);
    router.push(href.assistantChat(chatId));
  });
}

function BackUpNow({ picked }: { readonly picked: number }): ReactNode {
  const handle = useBackupHandle();
  const phase = useBackupStatus().phase;
  if (handle === null || phase === 'off' || phase === 'unavailable' || phase === 'denied') {
    return (
      <Button
        label="Turn on backup"
        icon="upload"
        variant="tonal"
        href={PHOTOS_BACKUP_SETTINGS_HREF}
      />
    );
  }
  return (
    <Button
      label="Back up now"
      icon="upload"
      variant="tonal"
      disabled={picked === 0}
      onPress={() => {
        background(handle.runner.request(), 'photos.device.backup_now_failed');
        notify({ message: 'Backing up this device', tone: 'positive' });
      }}
    />
  );
}

function AskAboutIt({ picked }: { readonly picked: readonly LocalMediaItem[] }): ReactNode {
  const last = useLastChat();
  const chatId = last.kind === 'open' ? last.chatId : null;
  const only = picked.length === 1 ? picked[0] : undefined;
  return (
    <Button
      label="Ask about it"
      icon="sparkles"
      variant="outlined"
      disabled={only === undefined || chatId === null}
      onPress={() => {
        if (only === undefined || chatId === null) return;
        askAboutLocal(only, chatId).catch((error: unknown) => {
          notify({ message: 'Could not ask about it in the chat', error, tone: 'critical' });
        });
      }}
      {...(chatId === null ? { hint: NO_CHAT_HINT } : {})}
    />
  );
}

export function DeviceSelection({ controls, items }: DeviceSelectionProps): ReactNode {
  useEscape(controls.selection.active, controls.clear);
  const picked = pickedLocalItems(controls.selection.ids, items);
  return (
    <View className="min-h-15 flex-row flex-wrap items-center gap-2 bg-primary-container px-gutter py-2">
      <IconButton
        icon="close"
        label="Clear the selection"
        tone="onPrimaryContainer"
        onPress={controls.clear}
      />
      <Text
        variant="title-3"
        tone="onPrimaryContainer"
        className="min-w-0 flex-1 tabular-nums"
        numberOfLines={1}
      >
        {pickedLocalText(picked.length)}
      </Text>
      {picked.length < items.length ? (
        <Button label="Select all" variant="text" onPress={controls.all} />
      ) : null}
      <BackUpNow picked={picked.length} />
      <AskAboutIt picked={picked} />
    </View>
  );
}
