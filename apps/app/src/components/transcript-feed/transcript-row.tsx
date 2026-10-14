import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TranscriptHit } from '@smarteverything/domain';
import { cn } from '../../design/cn';
import { transcriptTimestamp } from './timestamp';
import { IconButton } from '../icon-button';
import { Interactive } from '../interactive';
import { Text } from '../text';

export interface TranscriptRowProps {
  readonly hit: TranscriptHit;
  readonly timeZone: string;
  readonly highlighted: boolean;
  readonly ready: (() => void) | undefined;
  readonly open: (() => void) | undefined;
  readonly remove: ((hit: TranscriptHit) => void) | undefined;
}

export function TranscriptRow({
  hit,
  timeZone,
  highlighted,
  ready,
  open,
  remove,
}: TranscriptRowProps): ReactNode {
  const timestamp = transcriptTimestamp(hit.line.at, timeZone);
  const speaker = hit.line.speaker_id === null ? '' : ` · ${hit.line.speaker}`;
  return (
    <View
      onLayout={ready}
      className={cn(
        'flex-row border-b border-outline-variant bg-surface-1',
        highlighted && 'bg-primary-container',
      )}
    >
      <Interactive
        onPress={open}
        selected={highlighted}
        role={open === undefined ? 'text' : 'button'}
        label={`${hit.session.title}${speaker}, ${timestamp}. ${hit.line.text}`}
        hint={open === undefined ? undefined : 'Open this exact line in its transcript'}
        className="min-w-0 flex-1 gap-1 px-4 py-3"
      >
        <Text
          variant="caption"
          tone={highlighted ? 'primary' : 'variant'}
        >{`${hit.session.title}${speaker} · ${timestamp}`}</Text>
        <Text variant="body" selectable>
          {hit.line.text}
        </Text>
      </Interactive>
      {remove === undefined ? null : (
        <View className="justify-center pr-2">
          <IconButton
            icon="trash"
            label={`Delete transcript session: ${hit.session.title}`}
            onPress={() => {
              remove(hit);
            }}
          />
        </View>
      )}
    </View>
  );
}
