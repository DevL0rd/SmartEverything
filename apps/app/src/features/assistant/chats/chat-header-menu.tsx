import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { MenuItem } from '../../../components/menu';

export function chatMenuItems(chatId: string): readonly MenuItem[] {
  return [
    {
      label: 'Files',
      icon: 'folder',
      onPress: (): void => {
        router.push(href.assistantChatFiles(chatId));
      },
    },
  ];
}
