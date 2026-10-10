import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { href } from '../../app-shell/hrefs';
import { Icon } from '../../components/icon';
import { Interactive } from '../../components/interactive';
import { Text } from '../../components/text';
import { entering, exiting, useMotion } from '../../design/motion';
import { useTalkChannel } from './data/talk-data';
import { talkEngine } from './engine/engine';
import { useTalkEngine, type TalkEngineState } from './engine/engine-state';
import { VoiceRing } from './components/voice-ring';

const PILL: Readonly<Record<'talk' | 'hear', string>> = {
  talk: 'max-w-dialog flex-row items-center gap-1 rounded-full bg-critical p-1 elevation-3',
  hear: 'max-w-dialog flex-row items-center gap-1 rounded-full bg-primary p-1 elevation-3',
};

interface BarContent {
  readonly channelId: string;
  readonly title: string;
  readonly mode: 'talking' | 'hearing' | 'live';
  readonly level: number;
}

function contentOf(engine: TalkEngineState): BarContent | null {
  const { transmit, receive, live } = engine;
  if (live !== null) {
    return {
      channelId: live.channelId,
      title: `${live.label} is talking with`,
      mode: 'live',
      level: engine.level,
    };
  }
  if (transmit.status === 'talking' && transmit.channelId !== null) {
    const talking = transmit.cameraId === null;
    return {
      channelId: transmit.channelId,
      title: talking ? 'You’re talking' : 'Listening',
      mode: talking ? 'talking' : 'hearing',
      level: engine.level,
    };
  }
  if (receive !== null) {
    return {
      channelId: receive.channelId,
      title: receive.speaker.label,
      mode: 'hearing',
      level: 0,
    };
  }
  return null;
}

function placeLine(content: BarContent, place: string): string {
  return content.mode === 'live' ? `${place} · mic on` : place;
}

function StopLive(): ReactNode {
  return (
    <Interactive
      role="button"
      label="Stop the conversation on this device"
      onTone="primary"
      onPress={talkEngine.leaveLive}
      className="min-h-touch-min flex-row items-center gap-1 rounded-full px-3"
      layerClassName="rounded-full"
    >
      <Icon name="close" size={20} tone="onPrimary" />
      <Text variant="label" tone="onPrimary">
        Stop
      </Text>
    </Interactive>
  );
}

function Summary({
  content,
  place,
}: {
  readonly content: BarContent;
  readonly place: string;
}): ReactNode {
  const talking = content.mode === 'talking';
  return (
    <Interactive
      href={href.talkChannel(content.channelId)}
      label={`${content.title} ${placeLine(content, place)}`}
      onTone="primary"
      className="min-w-0 shrink flex-row items-center gap-3 rounded-full py-1 pl-1 pr-3"
      layerClassName="rounded-full"
    >
      <View className="size-9 items-center justify-center">
        <VoiceRing
          motion={content.mode === 'hearing' ? 'pulse' : 'level'}
          level={content.level}
          tone={talking ? 'talk' : 'hear'}
          className="size-9"
        />
        <Icon name={content.mode === 'hearing' ? 'audioLines' : 'mic'} size={20} tone="onPrimary" />
      </View>
      <View className="min-w-0 shrink">
        <Text variant="label" tone="onPrimary">
          {content.title}
        </Text>
        <Text variant="caption" tone="onPrimary">
          {placeLine(content, place)}
        </Text>
      </View>
    </Interactive>
  );
}

export function TalkBar(): ReactNode {
  const content = contentOf(useTalkEngine());
  const motion = useMotion();
  const channel = useTalkChannel(content?.channelId ?? null);
  if (content === null) {
    return null;
  }
  return (
    <Animated.View
      {...entering(motion, FadeInUp)}
      {...exiting(motion, FadeOutUp)}
      pointerEvents="box-none"
      className="absolute inset-x-4 top-safe-offset-2 items-center"
    >
      <View className={PILL[content.mode === 'talking' ? 'talk' : 'hear']}>
        <Summary content={content} place={channel?.name ?? 'Walkie-talkie'} />
        {content.mode === 'live' ? <StopLive /> : null}
      </View>
    </Animated.View>
  );
}
