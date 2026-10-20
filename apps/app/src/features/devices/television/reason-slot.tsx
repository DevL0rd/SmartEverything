import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Television, TvNote } from './use-television';
import type { TvView } from './view';

function quietText(view: TvView): string | null {
  switch (view.mode) {
    case 'turning_on':
      return view.wakesOverNetwork ? 'Waking…' : 'Turning on…';
    case 'updating':
      return 'The TV is installing an update';
    case 'unreachable':
      return "The TV isn't answering";
    case 'off_unreachable':
      return 'Link it directly in its settings';
    case 'standby':
      return 'Turn the TV on to use the remote';
    case 'on':
      return null;
  }
}

function Hint({
  icon,
  text,
}: {
  readonly icon: 'keyboard' | 'hand';
  readonly text: string;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name={icon} size={16} />
      <Text variant="footnote" tone="variant">
        {text}
      </Text>
    </View>
  );
}

function Note({ tv, note }: { readonly tv: Television; readonly note: TvNote }): ReactNode {
  const critical = note.tone === 'critical';
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-1.5">
      <Icon name={critical ? 'alert' : 'info'} size={16} tone={critical ? 'critical' : 'variant'} />
      <Text variant="footnote" tone={critical ? 'critical' : 'variant'}>
        {note.text}
      </Text>
      {note.wake ? <Button label="Turn on" variant="text" onPress={tv.togglePower} /> : null}
    </View>
  );
}

function slotContent(tv: Television, keyboard: boolean, held: boolean): ReactNode {
  const quiet = quietText(tv.view);
  if (tv.note !== null) {
    return <Note tv={tv} note={tv.note} />;
  }
  if (quiet !== null) {
    return (
      <Text variant="footnote" tone="variant" align="center">
        {quiet}
      </Text>
    );
  }
  if (keyboard) {
    return <Hint icon="keyboard" text="Keyboard controls on" />;
  }
  return held ? null : <Hint icon="hand" text="Hold a button to repeat it" />;
}

export function ReasonSlot({
  tv,
  keyboard,
  held,
}: {
  readonly tv: Television;
  readonly keyboard: boolean;
  readonly held: boolean;
}): ReactNode {
  const spoken = tv.note?.text ?? null;
  useEffect(() => {
    if (spoken !== null && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(spoken);
    }
  }, [spoken]);
  return (
    <View
      accessibilityLiveRegion={tv.note?.tone === 'critical' ? 'assertive' : 'polite'}
      className="absolute inset-x-4 top-2 h-8 items-center justify-center"
    >
      {slotContent(tv, keyboard, held)}
    </View>
  );
}
