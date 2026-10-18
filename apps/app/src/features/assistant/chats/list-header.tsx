import type { ReactNode } from 'react';
import { View } from 'react-native';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { IconButton } from '../../../components/icon-button';
import { PageSettingsButton } from '../../../components/page-settings-button';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { toggleChatList } from './chat-list-toggle';

export type ListHeaderKind = 'screen' | 'pane' | 'slide-over';

function ScreenHeader(): ReactNode {
  return (
    <View className="flex-row items-center gap-1 pb-1 pl-gutter pr-2 pt-safe-offset-2">
      <Text variant="large-title" accessibilityRole="header" className="min-w-0 flex-1">
        Chats
      </Text>
      <PageSettingsButton settings={mainPageSettings('assistant')} />
    </View>
  );
}

function PaneHeader({ kind }: { readonly kind: 'pane' | 'slide-over' }): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <View className="min-h-page-header flex-row items-center gap-1 pl-gutter pr-2">
      <Text variant="title-3" accessibilityRole="header" className="min-w-0 flex-1">
        Chats
      </Text>
      {kind === 'pane' ? (
        <IconButton
          icon="panelLeft"
          label="Hide chat list"
          shortcut="⌘\"
          onPress={toggleChatList}
        />
      ) : null}
      {touch ? <PageSettingsButton settings={mainPageSettings('assistant')} /> : null}
    </View>
  );
}

export function ListHeader({ kind }: { readonly kind: ListHeaderKind }): ReactNode {
  return kind === 'screen' ? <ScreenHeader /> : <PaneHeader kind={kind} />;
}
