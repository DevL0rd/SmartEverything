import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { router } from 'expo-router';
import type { DesktopTalkCommand, DesktopTalkTray, TalkChannelRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { setTalkChannels } from '../../../modules/health-connect';
import { useConnection } from '../../api/transport';
import { href } from '../../app-shell/hrefs';
import { appPlatform, desktopBridge } from '../../design/platform';
import { rawErrorText } from '../../format/errors';
import { localPref, useLocalPref } from '../../store/local-prefs';
import { chooseTalkChannel, nextTalkChannel, useTalkChannelId } from './data/talk-channel';
import { useMyChannels } from './data/talk-data';
import { engineStatus } from './data/talk-status';
import { loadDesktopTalk } from './desktop/use-talk-shortcuts';
import { talkEngine } from './engine/engine';
import { engineState, useTalkEngineValue, type TalkEngineState } from './engine/engine-state';
import { TalkBar } from './talk-bar';

const log = new Logger('app.talk-host');

function useEngineLifecycle(listening: boolean): void {
  const connection = useConnection();
  const enabled = useLocalPref('talkEnabled');
  const paired = connection.status === 'paired' ? connection.connection : null;
  useEffect(() => {
    if (!enabled || !listening || paired === null) {
      return undefined;
    }
    talkEngine.start({ url: paired.url, token: paired.token });
    return (): void => {
      talkEngine.stop();
    };
  }, [enabled, listening, paired]);
}

function holdCommand(incoming: DesktopTalkCommand): DesktopTalkCommand | null {
  if (localPref('talkMode') === 'hold') {
    return incoming;
  }
  if (incoming.kind === 'press') {
    return { kind: 'toggle' };
  }
  return incoming.kind === 'release' ? null : incoming;
}

function transmitOn(talkChannel: string | null, kind: 'press' | 'toggle'): void {
  if (talkChannel === null) {
    return;
  }
  if (kind === 'toggle' && engineState.get().transmit.status !== 'idle') {
    talkEngine.release();
  } else {
    talkEngine.press(talkChannel);
  }
}

function command(
  channels: readonly TalkChannelRow[],
  talkChannel: string | null,
): (command: DesktopTalkCommand) => void {
  return (raw) => {
    const incoming = holdCommand(raw);
    if (incoming === null) {
      return;
    }
    if (incoming.kind === 'press' || incoming.kind === 'toggle') {
      transmitOn(talkChannel, incoming.kind);
    } else if (incoming.kind === 'release') {
      talkEngine.release();
    } else if (incoming.kind === 'next') {
      nextTalkChannel(channels);
    } else if (incoming.kind === 'select') {
      chooseTalkChannel(incoming.channelId);
    } else {
      router.navigate(href.talk());
    }
  };
}

function activityOf(state: TalkEngineState): DesktopTalkTray['activity'] {
  if (state.transmit.status === 'talking') {
    return 'talking';
  }
  return state.receive === null && state.live === null ? 'idle' : 'receiving';
}

function useDesktop(channels: readonly TalkChannelRow[], talkChannel: string | null): void {
  const channel = channels.find((each) => each.id === talkChannel);
  const status = useTalkEngineValue((state) => engineStatus(state, channel, channels.length > 0));
  const activity = useTalkEngineValue(activityOf);
  const bridge = desktopBridge();
  useEffect(() => {
    loadDesktopTalk();
  }, []);
  useEffect(
    () => bridge?.onTalkCommand?.(command(channels, talkChannel)),
    [bridge, channels, talkChannel],
  );
  useEffect(() => {
    bridge
      ?.setTalkTray?.({
        status,
        activity,
        channels: channels.map((channel) => ({ id: channel.id, name: channel.name })),
        talkChannel,
      })
      .catch((error: unknown) => {
        log.warn('talk.tray_failed', { reason: rawErrorText(error) });
      });
  }, [bridge, status, activity, channels, talkChannel]);
}

function useAndroid(channels: readonly TalkChannelRow[], talkChannel: string | null): void {
  const enabled = useLocalPref('talkEnabled');
  useEffect(() => {
    if (!enabled) {
      return;
    }
    setTalkChannels(
      channels.map((channel) => ({ id: channel.id, name: channel.name })),
      talkChannel ?? '',
    ).catch((error: unknown) => {
      log.warn('talk.native_channels_failed', { reason: rawErrorText(error) });
    });
  }, [enabled, channels, talkChannel]);
}

function DesktopTalk(): ReactNode {
  const channels = useMyChannels();
  useDesktop(channels, useTalkChannelId());
  return null;
}

function AndroidTalk(): ReactNode {
  const channels = useMyChannels();
  useAndroid(channels, useTalkChannelId());
  return null;
}

function EngineLifecycle(): null {
  useEngineLifecycle(useMyChannels().length > 0);
  return null;
}

export function TalkHost(): ReactNode {
  const platform = appPlatform();
  return (
    <>
      <EngineLifecycle />
      {platform === 'desktop' ? <DesktopTalk /> : null}
      {platform === 'android' ? <AndroidTalk /> : null}
      <TalkBar />
    </>
  );
}
