import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { updateEndOfSpeechPause } from '../../../api/settings';
import { Card } from '../../../components/card';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { useStoreSelector } from '../../../store/store-context';
import { pauseOf } from '../call/settings-sheet/call-audio-pref';
import { PAUSE_OPTIONS, pauseHint, pauseOfValue } from './pause-model';

export function PauseCard({ offline }: { readonly offline: boolean }): ReactNode {
  const pauseMs = useStoreSelector(pauseOf);
  return (
    <Card title="End-of-speech pause" icon="timer">
      <Segmented
        label="End-of-speech pause"
        options={PAUSE_OPTIONS}
        value={String(pauseMs)}
        disabled={offline}
        onChange={(value) => {
          background(updateEndOfSpeechPause(pauseOfValue(value)), 'listening.pause_failed');
        }}
      />
      <Text variant="footnote" tone="variant">
        {pauseHint(pauseMs)} One setting for calls and for every ear: cameras, computers and phones.
      </Text>
    </Card>
  );
}
