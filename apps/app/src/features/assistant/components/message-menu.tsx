import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu } from '../../../components/menu';
import type { MessageActions } from './message-actions';

export function MessageMenu({ actions }: { readonly actions: MessageActions }): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(actions.list, 'Message actions', {
    quick: actions.quick,
  });
  return (
    <View ref={ref} collapsable={false} className="shrink-0">
      <IconButton icon="ellipsis" label="Message actions" onPress={open} />
      {menu}
    </View>
  );
}
