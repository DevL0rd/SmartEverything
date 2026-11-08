import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { DeviceVisual } from '../../device-visuals';
import { WIDE_VISUAL_PX, WideCard, type WideClass } from '../card/wide-card';
import { PowerButton } from './power-button';
import type { Television } from './use-television';

interface Note {
  readonly icon: 'refresh' | 'info' | 'wifi' | null;
  readonly tone: 'warning' | 'variant';
  readonly text: string;
  readonly hint: string | null;
}

function wakeCaption(tv: Television): string {
  if (tv.view.mode === 'turning_on') {
    return tv.view.wakesOverNetwork
      ? 'Waking it over the home network, this can take a minute'
      : 'Waiting for the TV to answer';
  }
  return tv.view.wakesOverNetwork ? 'Wakes over the home network' : 'Wakes through SmartThings';
}

function noteOf(tv: Television): Note | null {
  switch (tv.view.mode) {
    case 'standby':
    case 'turning_on':
      return { icon: null, tone: 'variant', text: wakeCaption(tv), hint: null };
    case 'updating':
      return {
        icon: 'refresh',
        tone: 'warning',
        text: 'The TV is installing an update',
        hint: 'Buttons come back when it restarts',
      };
    case 'off_unreachable':
      return {
        icon: 'info',
        tone: 'variant',
        text: "Can't turn on from here yet",
        hint: 'Link it directly in its settings',
      };
    case 'unreachable':
      return {
        icon: 'wifi',
        tone: 'warning',
        text: 'Check that the TV is plugged in and on Wi-Fi',
        hint: 'No other way to reach it yet',
      };
    case 'on':
      return null;
  }
}

function NoteLines({ note }: { readonly note: Note }): ReactNode {
  if (note.icon === null) {
    return (
      <Text variant="caption" tone="variant">
        {note.text}
      </Text>
    );
  }
  return (
    <>
      <View className="flex-row items-center gap-2">
        <Icon name={note.icon} size={16} tone={note.tone} />
        <Text variant="footnote" numberOfLines={2} className="min-w-0 flex-1">
          {note.text}
        </Text>
      </View>
      {note.hint === null ? null : (
        <Text variant="caption" tone="variant">
          {note.hint}
        </Text>
      )}
    </>
  );
}

function State({ tv, note }: { readonly tv: Television; readonly note: Note | null }): ReactNode {
  const trouble = tv.view.mode === 'unreachable' || tv.view.mode === 'updating';
  return (
    <>
      <Text variant="footnote" tone={trouble ? 'warning' : 'variant'} numberOfLines={1}>
        {tv.line}
      </Text>
      {note === null ? null : <NoteLines note={note} />}
    </>
  );
}

function WakeButton({ tv }: { readonly tv: Television }): ReactNode {
  const waiting = tv.view.mode === 'turning_on';
  return (
    <Button
      label={waiting ? 'Turning on…' : 'Turn on'}
      icon="power"
      variant="tonal"
      disabled={waiting}
      onPress={tv.togglePower}
    />
  );
}

function Wake({ tv, note }: { readonly tv: Television; readonly note: Note }): ReactNode {
  return (
    <View className="flex-1 items-center justify-center gap-2">
      <WakeButton tv={tv} />
      <Text variant="caption" tone="variant" align="center">
        {note.text}
      </Text>
    </View>
  );
}

export function Quiet({ tv }: { readonly tv: Television }): ReactNode {
  const note = noteOf(tv);
  if (note === null) {
    return null;
  }
  if (note.icon === null) {
    return <Wake tv={tv} note={note} />;
  }
  return (
    <View className="flex-1 justify-center gap-1" pointerEvents="none">
      <NoteLines note={note} />
    </View>
  );
}

function spokenOf(tv: Television, note: Note | null): string {
  const parts = note === null ? [tv.name, tv.line] : [tv.name, tv.line, note.text, note.hint];
  return parts.filter((part) => part !== null).join(', ');
}

export function RestingCard({
  tv,
  cls,
}: {
  readonly tv: Television;
  readonly cls: WideClass;
}): ReactNode {
  const note = noteOf(tv);
  const wakes = tv.view.mode === 'standby' || tv.view.mode === 'turning_on';
  return (
    <WideCard
      cls={cls}
      summary={spokenOf(tv, note)}
      visual={<DeviceVisual device={tv.device} size="card" px={WIDE_VISUAL_PX[cls]} />}
      title={tv.name}
      state={<State tv={tv} note={note} />}
      actions={[wakes ? <WakeButton key="wake" tv={tv} /> : <PowerButton key="power" tv={tv} />]}
    />
  );
}
