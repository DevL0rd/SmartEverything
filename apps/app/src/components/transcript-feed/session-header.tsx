import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TranscriptSession } from '@smarteverything/domain';
import { clock } from '../../format/time';
import { Button } from '../button';
import { Text } from '../text';

export interface SessionHeaderProps {
  readonly session: TranscriptSession;
  readonly timeZone: string;
  readonly remove: ((session: TranscriptSession) => void) | undefined;
}

function rangeOf(session: TranscriptSession, timeZone: string): string {
  const start = clock(session.started_at, timeZone);
  return session.ended_at === null
    ? `${start} – now`
    : `${start} – ${clock(session.ended_at, timeZone)}`;
}

export function SessionHeader({ session, timeZone, remove }: SessionHeaderProps): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-2 bg-surface-2 px-4 py-1">
      <Text variant="caption" tone="variant" className="min-w-0 flex-1" numberOfLines={1}>
        {`${rangeOf(session, timeZone)} · ${String(session.line_count)} lines`}
      </Text>
      {remove === undefined ? null : (
        <Button
          label="Delete transcript"
          icon="trash"
          variant="text"
          hint="Deletes every line of this recording"
          onPress={() => {
            remove(session);
          }}
        />
      )}
    </View>
  );
}
