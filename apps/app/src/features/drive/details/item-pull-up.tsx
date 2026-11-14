import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { DriveItem } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { BottomSheet } from '../../../components/bottom-sheet';
import { FileGlyph } from '../../../components/files/file-glyph';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import type { PickedFile } from '../../../platform/pick-files';
import { attachFiles, useLastChat } from '../../assistant';
import { runAction, trashItems } from '../folder/folder-footer';
import { DriveThumb, entryKindOf } from '../folder/folder-list';
import { captionOf } from '../folder/folder-model';
import { DetailsTabs } from './details-tabs';
import {
  quickActionsOf,
  rememberTab,
  sizeTextOf,
  type DetailsSlots,
  type DetailsSubject,
  type QuickAction,
} from './details-model';
import { fileLinkOf } from './preview-tab';

const PULL_UP_DETENTS = ['half', 'full'] as const;

export const NO_CHAT_HINT = 'Open a chat first, then come back to add this file to it.';

async function originalOf(item: DriveItem): Promise<ArrayBuffer> {
  const response = await fetch(await fileLinkOf(item));
  if (!response.ok) {
    throw new Error(`Downloading ${item.name} failed with status ${String(response.status)}`);
  }
  return response.arrayBuffer();
}

function pickedOf(item: DriveItem): PickedFile | null {
  if (item.kind === 'folder') return null;
  return {
    name: item.name,
    mime: item.mime,
    bytes: item.bytes,
    preview: null,
    data: () => originalOf(item),
  };
}

function useToChat(): (item: DriveItem) => void {
  const last = useLastChat();
  const chatId = last.kind === 'open' ? last.chatId : null;
  return (item) => {
    const file = pickedOf(item);
    if (file === null) return;
    if (chatId === null) {
      notify({ message: NO_CHAT_HINT });
      return;
    }
    attachFiles([file], chatId);
    notify({
      message: `${file.name} added to the message field`,
      tone: 'positive',
      action: {
        label: 'Open chat',
        onPress: () => {
          router.push(href.assistantChat(chatId));
        },
      },
    });
  };
}

interface QuickSpec {
  readonly label: string;
  readonly icon: IconName;
}

function specOf(action: QuickAction, item: DriveItem): QuickSpec {
  switch (action) {
    case 'preview':
      return { label: 'Preview', icon: 'eye' };
    case 'star':
      return { label: item.starred ? 'Starred' : 'Star', icon: 'star' };
    case 'share':
      return { label: 'Share', icon: 'share' };
    case 'chat':
      return { label: 'To chat', icon: 'messageCircle' };
    case 'trash':
      return { label: 'Trash', icon: 'trash' };
  }
}

function QuickButton({
  spec,
  active,
  onPress,
}: {
  readonly spec: QuickSpec;
  readonly active: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      role="button"
      label={spec.label}
      onPress={onPress}
      className="min-w-0 flex-1 items-center gap-1.5 rounded-md py-1"
    >
      <View className="h-10 w-14 items-center justify-center rounded-full bg-surface-2">
        <Icon name={spec.icon} size={20} tone={active ? 'primary' : 'default'} />
      </View>
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {spec.label}
      </Text>
    </Interactive>
  );
}

interface PullUpProps {
  readonly subject: DetailsSubject;
  readonly slots: DetailsSlots;
  readonly share: (item: DriveItem) => void;
  readonly close: () => void;
}

function useQuickRun({ subject, share, close }: PullUpProps): (action: QuickAction) => void {
  const toChat = useToChat();
  const { item } = subject;
  return (action) => {
    if (action === 'preview') rememberTab('preview');
    else if (action === 'star') {
      runAction(item.starred ? 'unstar' : 'star', item, {
        open: () => undefined,
        details: () => undefined,
        rename: () => undefined,
      });
    } else if (action === 'share') share(item);
    else if (action === 'chat') toChat(item);
    else {
      trashItems([item]);
      close();
    }
  };
}

function QuickRow(props: PullUpProps): ReactNode {
  const run = useQuickRun(props);
  const { item } = props.subject;
  const actions = quickActionsOf(item, props.subject.writable);
  return (
    <View className="flex-row px-2 pb-3">
      {actions.map((action) => (
        <QuickButton
          key={action}
          spec={specOf(action, item)}
          active={action === 'star' && item.starred}
          onPress={() => {
            run(action);
          }}
        />
      ))}
    </View>
  );
}

function PullUpHeader({
  item,
  close,
}: {
  readonly item: DriveItem;
  readonly close: () => void;
}): ReactNode {
  const caption = captionOf(item) ?? sizeTextOf(item);
  return (
    <View className="flex-row items-center gap-3 px-4 pb-3 pt-1">
      {item.kind === 'folder' || item.thumb.state !== 'ready' ? (
        <View className="size-12 items-center justify-center rounded-md bg-surface-3">
          <FileGlyph kind={entryKindOf(item)} name={item.name} />
        </View>
      ) : (
        <DriveThumb item={item} className="size-12 rounded-md" />
      )}
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
          {caption}
        </Text>
      </View>
      <IconButton icon="close" label="Close details" onPress={close} />
    </View>
  );
}

export function ItemPullUp(props: PullUpProps): ReactNode {
  const { subject, slots, share, close } = props;
  return (
    <BottomSheet open onClose={close} label={subject.item.name} detents={PULL_UP_DETENTS} scroll>
      <PullUpHeader item={subject.item} close={close} />
      <QuickRow {...props} />
      <DetailsTabs subject={subject} slots={slots} share={share} pane={false} />
    </BottomSheet>
  );
}
