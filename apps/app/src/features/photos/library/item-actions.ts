import { router } from 'expo-router';
import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { createDriveShare, readDriveItem } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { copyText } from '../../../components/copy-button';
import { notify } from '../../../components/toast-store';
import { count } from '../../../format/number';
import type { PickedFile } from '../../../platform/pick-files';
import { attachFiles } from '../../assistant';
import { openHrefOf } from '../../drive';
import { pickedOf } from '../model/ask-actions';

const log = new Logger('app.photos');

export interface ItemDeps {
  readonly read: (itemId: string) => Promise<DriveItem>;
  readonly attach: (files: readonly PickedFile[], chatId: string) => void;
  readonly openChat: (chatId: string) => void;
}

const LIVE: ItemDeps = {
  read: readDriveItem,
  attach: attachFiles,
  openChat: (chatId) => {
    router.push(href.assistantChat(chatId));
  },
};

function failed(message: string, error: unknown): void {
  log.warn('photos.item_action_failed', { message });
  notify({ message, error, tone: 'critical' });
}

function chatText(files: readonly PickedFile[]): string {
  const first = files[0];
  if (files.length === 1 && first !== undefined) return `${first.name} added to the message field`;
  return `${count(files.length)} files added to the message field`;
}

export async function sendToChat(
  itemIds: readonly string[],
  chatId: string,
  deps: ItemDeps = LIVE,
): Promise<number> {
  try {
    const items = await Promise.all(itemIds.map(deps.read));
    const files = items
      .map((item) => pickedOf(item, null))
      .filter((file): file is PickedFile => file !== null);
    if (files.length === 0) return 0;
    deps.attach(files, chatId);
    notify({
      message: chatText(files),
      tone: 'positive',
      action: {
        label: 'Open chat',
        onPress: () => {
          deps.openChat(chatId);
        },
      },
    });
    return files.length;
  } catch (error) {
    failed('Could not add to the chat', error);
    return 0;
  }
}

export async function askAbout(
  itemId: string,
  chatId: string,
  deps: ItemDeps = LIVE,
): Promise<boolean> {
  try {
    const file = pickedOf(await deps.read(itemId), null);
    if (file === null) return false;
    deps.attach([file], chatId);
    deps.openChat(chatId);
    return true;
  } catch (error) {
    failed('Could not ask about it in the chat', error);
    return false;
  }
}

export function linksName(count: number, isPublic: boolean): string {
  const noun = count === 1 ? 'link' : 'links';
  return isPublic ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)}` : `Home network ${noun}`;
}

export async function shareLinks(itemIds: readonly string[]): Promise<void> {
  try {
    const created = await Promise.all(
      itemIds.map((itemId) =>
        createDriveShare({ itemId, permission: 'view', expiresAt: null, password: null }),
      ),
    );
    copyText(
      created.map((share) => share.url).join('\n'),
      linksName(
        created.length,
        created.every((share) => share.public),
      ),
    );
  } catch (error) {
    failed(itemIds.length === 1 ? 'The link was not made' : 'The links were not made', error);
  }
}

export async function showInDrive(
  itemId: string,
  roots: readonly Pick<DriveRoot, 'id' | 'scope'>[],
  deps: ItemDeps = LIVE,
): Promise<void> {
  try {
    const item = await deps.read(itemId);
    router.navigate(openHrefOf(item, roots));
  } catch (error) {
    failed('Could not open it in Drive', error);
  }
}
