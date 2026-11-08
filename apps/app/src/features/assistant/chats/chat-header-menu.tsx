import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { OverflowButton, type MenuItem } from '../../../components/menu';

function chatMenuItems(chatId: string): readonly MenuItem[] {
  const settings = mainPageSettings('assistant');
  return [
    {
      label: 'Files',
      icon: 'folder',
      onPress: (): void => {
        router.push(href.assistantChatFiles(chatId));
      },
    },
    {
      label: settings.label,
      icon: 'sparkles',
      onPress: (): void => {
        router.navigate(settings.href);
      },
    },
  ];
}

export function ChatHeaderMenu({ chatId }: { readonly chatId: string }): ReactNode {
  return <OverflowButton label="Chat menu" items={chatMenuItems(chatId)} />;
}
