import type { ReactNode } from 'react';
import { Badge } from '../../../components/badge';
import { LevelPill } from '../../../components/level-pill';
import { LOW_LEVEL } from '../../../components/level-pill-model';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import type { WideClass } from '../card/wide-card';

export function StateLine({
  line,
  room,
  tone,
}: {
  readonly line: string;
  readonly room: string | null;
  readonly tone: Tone;
}): ReactNode {
  return (
    <Text variant="footnote" tone={tone} numberOfLines={1}>
      {room === null ? line : `${line} · ${room}`}
    </Text>
  );
}

export function roomOnCard(cls: WideClass, room: string | null): string | null {
  return cls === 'm' ? null : room;
}

export function offlineChip(offline: boolean): ReactNode {
  return offline ? <Badge label="Offline" /> : undefined;
}

export function levelPill(noun: string | null, percent: number | null): ReactNode {
  if (percent === null) {
    return null;
  }
  const rounded = String(Math.round(percent));
  const lowWord = noun === null ? undefined : `${noun} low`;
  const label = noun === null ? undefined : `${noun} ${rounded} %`;
  const shown = percent <= LOW_LEVEL ? lowWord : label;
  const key = noun ?? 'level';
  return shown === undefined ? (
    <LevelPill key={key} percent={percent} />
  ) : (
    <LevelPill key={key} percent={percent} label={shown} />
  );
}

export function summaryOf({
  name,
  room,
  offline,
  facts,
}: {
  readonly name: string;
  readonly room: string | null;
  readonly offline: boolean;
  readonly facts: readonly string[];
}): string {
  const head = room === null ? name : `${name}, ${room}`;
  return [head, ...(offline ? ['Offline'] : []), ...facts].join('. ');
}
