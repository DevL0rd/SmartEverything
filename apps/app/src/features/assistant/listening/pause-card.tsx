import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { updateEndOfSpeechPause } from '../../../api/settings';
import { Card } from '../../../components/card';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { useStoreSelector } from '../../../store/store-context';
import { pauseOf } from '../call/settings-sheet/call-audio-pref';
import { PAUSE_OPTIONS, pauseHint, pauseOfValue } from './pause-model';

export function PauseCard({ offline }: { readonly offline: boolean }): ReactNode {
  const pauseMs = useStoreSelector(pauseOf);
  const value = String(pauseMs);
  return (
    <Card title="End-of-speech pause" icon="timer">
      <Select
        label="End-of-speech pause"
        options={PAUSE_OPTIONS}
        value={value}
        showLabel={false}
        disabled={offline}
        onChange={(next) => {
          if (next !== value) {
            background(updateEndOfSpeechPause(pauseOfValue(next)), 'listening.pause_failed');
          }
        }}
      />
      <Text variant="footnote" tone="variant">
        {pauseHint(pauseMs)} One setting for calls and for every ear: cameras, computers and phones.
      </Text>
    </Card>
  );
}
