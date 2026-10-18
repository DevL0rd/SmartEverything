import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TranscriptHit } from '@smarteverything/domain';
import { cn } from '../../design/cn';
import { transcriptTime } from './timestamp';
import { IconButton } from '../icon-button';
import { Interactive } from '../interactive';
import { Text } from '../text';

export interface TranscriptRowProps {
  readonly hit: TranscriptHit;
  readonly timeZone: string;
  readonly showSource: boolean;
  readonly highlighted: boolean;
  readonly ready: (() => void) | undefined;
  readonly open: (() => void) | undefined;
  readonly remove: ((hit: TranscriptHit) => void) | undefined;
}

function rowMeta(hit: TranscriptHit, time: string, showSource: boolean): string {
  const speaker = hit.line.speaker_id === null ? null : hit.line.speaker;
  return [showSource ? hit.session.title : null, speaker, time]
    .filter((part) => part !== null)
    .join(' · ');
}

export function TranscriptRow({
  hit,
  timeZone,
  showSource,
  highlighted,
  ready,
  open,
  remove,
}: TranscriptRowProps): ReactNode {
  const time = transcriptTime(hit.line.at, timeZone);
  const meta = rowMeta(hit, time, showSource);
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
        label={`${meta}. ${hit.line.text}`}
        hint={open === undefined ? undefined : 'Open this exact line in its transcript'}
        className="min-w-0 flex-1 gap-1 px-4 py-3"
      >
        <Text variant="caption" tone={highlighted ? 'primary' : 'variant'}>
          {meta}
        </Text>
        <Text variant="body" selectable>
          {hit.line.text}
        </Text>
      </Interactive>
      {remove === undefined ? null : (
        <View className="justify-center pr-2">
          <IconButton
            icon="trash"
            label={`Delete this line: ${hit.line.text.slice(0, 60)}`}
            onPress={() => {
              remove(hit);
            }}
          />
        </View>
      )}
    </View>
  );
}
