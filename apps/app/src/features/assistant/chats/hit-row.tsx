import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import type { AiChatHit } from '@smarteverything/domain';
import { Highlighted } from '../../../components/highlighted';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { chatListTime } from '../model/chat-list-time';
import type { ChatSource } from '../model/chat-source';
import { SourceMark } from './source-mark';

export interface HitRowProps {
  readonly hit: AiChatHit;
  readonly source: ChatSource;
  readonly query: string;
  readonly timeZone: string | null;
  readonly onOpen: (chatId: string, messageId: string | null) => void;
}

function rangeOf(
  text: string,
  query: string,
): { readonly start: number; readonly end: number } | null {
  const start = text.toLowerCase().indexOf(query.trim().toLowerCase());
  return start < 0 ? null : { start, end: start + query.trim().length };
}

function Row({ hit, source, query, timeZone, onOpen }: HitRowProps): ReactNode {
  const now = useMinute();
  return (
    <Interactive
      label={`${hit.title}, ${hit.snippet}`}
      onPress={() => {
        onOpen(hit.chatId, hit.messageId);
      }}
      className="min-h-chat-row flex-row items-center gap-3 px-gutter py-3"
    >
      <SourceMark source={source} size={40} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
            {hit.title}
          </Text>
          <Text variant="caption" tone="variant" className="tabular">
            {chatListTime(hit.at, now, timeZone)}
          </Text>
        </View>
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          <Highlighted text={hit.snippet} range={rangeOf(hit.snippet, query)} />
        </Text>
      </View>
    </Interactive>
  );
}

export const HitRow = memo(Row);
