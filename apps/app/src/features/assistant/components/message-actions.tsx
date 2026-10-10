import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { copyText } from '../../../components/copy-button';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import type { MenuItem } from '../../../components/menu';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { cn } from '../../../design/cn';
import { longDate, shortClock } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import { resend } from '../data/send';

export interface MessageActions {
  readonly items: readonly MenuItem[];
  readonly host: ReactNode;
}

function Details({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  return (
    <List inset>
      <ListRow title="Sent" value={`${longDate(row.created_at)} · ${shortClock(row.created_at)}`} />
      {row.model === null ? null : <ListRow title="Model" value={row.model} />}
    </List>
  );
}

export function useMessageActions(row: AssistantMessageRow): MessageActions {
  const [details, setDetails] = useState(false);
  const request = useRow('assistant_messages', row.reply_to);
  const retryOf = row.role === 'person' ? row : request;
  return {
    items: [
      ...(row.text === ''
        ? []
        : [
            {
              label: 'Copy',
              icon: 'copy' as const,
              onPress: (): void => {
                copyText(row.text, 'Message');
              },
            },
          ]),
      ...(retryOf === null
        ? []
        : [
            {
              label: 'Retry',
              icon: 'refresh' as const,
              onPress: (): void => {
                void resend(retryOf);
              },
            },
          ]),
      {
        label: 'Details',
        icon: 'info',
        onPress: (): void => {
          setDetails(true);
        },
      },
    ],
    host: (
      <Sheet
        open={details}
        onClose={() => {
          setDetails(false);
        }}
        title="Message details"
        detents={['fit']}
      >
        <Details row={row} />
      </Sheet>
    ),
  };
}

export function MessageActionBar({
  actions,
  pointer,
  visible,
  align,
}: {
  readonly actions: MessageActions;
  readonly pointer: boolean;
  readonly visible: boolean;
  readonly align: 'start' | 'end';
}): ReactNode {
  if (!pointer || !visible) {
    return null;
  }
  return (
    <View
      className={cn(
        'absolute -top-6 z-10 flex-row rounded-full border-hairline border-outline-variant bg-surface-2',
        align === 'end' ? 'right-0' : 'left-0',
      )}
    >
      {actions.items.map((item) => (
        <IconButton
          key={item.label}
          icon={item.icon ?? 'more'}
          label={item.label}
          onPress={item.onPress}
        />
      ))}
    </View>
  );
}
