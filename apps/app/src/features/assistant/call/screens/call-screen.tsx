import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CALL_SOURCE, type CallSource } from '@smarteverything/domain';
import { z } from 'zod';
import { useConnection } from '../../../../api/transport';
import { Glow } from '../../../../components/glow';
import { useEscape } from '../../../../components/use-escape';
import { appPlatform } from '../../../../design/platform';
import { useAssistantName } from '../../data/assistant-data';
import { callActive, callState, orbStateOf, useCall, type CallView } from '../call-state';
import { CallCaptions } from '../components/call-captions';
import { CallFooter } from '../components/call-footer';
import { CallHeader } from '../components/call-header';
import { CallStatus } from '../components/call-status';
import { ToolLines } from '../components/tool-lines';
import { useCallLevel } from '../components/use-call-level';
import { AssistantOrb } from '../orb';
import { callEngine } from '../engine/engine';

const DEVICE_LABELS = {
  android: 'the phone',
  desktop: 'the computer',
  web: 'the browser',
} as const;

const ORB_MIN = 160;
const ORB_MAX = 320;
const SHORT_HEIGHT = 560;
const ORB_SHORT_SHARE = 0.36;
const ORB_TALL_SHARE = 0.42;
const CLOSE_AFTER_MS = 900;

const ID = z.uuid();

function idOf(raw: string | undefined): string | null {
  const parsed = ID.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function sourceOf(raw: string | undefined): CallSource {
  const parsed = CALL_SOURCE.safeParse(raw);
  return parsed.success ? parsed.data : 'chat';
}

function leave(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

interface Paired {
  readonly url: string;
  readonly token: string;
}

interface Opening {
  readonly source: CallSource;
  readonly chatId: string | null;
  readonly answering: string | null;
}

function begin(paired: Paired, opening: Opening): void {
  callEngine.start({
    connection: { url: paired.url, token: paired.token },
    source: opening.source,
    chatId: opening.chatId,
    answering: opening.answering,
    device: DEVICE_LABELS[appPlatform()],
  });
}

function useStartOnOpen(opening: Opening): () => void {
  const connection = useConnection();
  const paired = connection.status === 'paired' ? connection.connection : null;
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || paired === null) {
      return;
    }
    opened.current = true;
    if (!callActive(callState.get())) {
      begin(paired, opening);
    }
  }, [paired, opening]);
  return (): void => {
    if (paired !== null) {
      begin(paired, { ...opening, answering: null });
    }
  };
}

function useCloseWhenHungUp(call: CallView): void {
  useEffect(() => {
    if (call.phase !== 'ended' || (call.ending !== 'hung_up' && call.ending !== 'finished')) {
      return undefined;
    }
    const timer = setTimeout(leave, CLOSE_AFTER_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [call.phase, call.ending]);
}

function useOpening(): Opening {
  const params = useLocalSearchParams<{ source?: string; chatId?: string; answering?: string }>();
  return useMemo(
    () => ({
      source: sourceOf(params.source),
      chatId: idOf(params.chatId),
      answering: idOf(params.answering),
    }),
    [params.source, params.chatId, params.answering],
  );
}

export function CallScreen(): ReactNode {
  const call = useCall();
  const name = useAssistantName();
  const { width, height } = useWindowDimensions();
  const opening = useOpening();
  const again = useStartOnOpen(opening);
  const level = useCallLevel(call.phase);
  useCloseWhenHungUp(call);
  useEscape(callActive(call), callEngine.end);
  const short = height < SHORT_HEIGHT;
  const share = short ? ORB_SHORT_SHARE : ORB_TALL_SHARE;
  const orb = Math.max(
    ORB_MIN * (short ? 0.75 : 1),
    Math.min(ORB_MAX, Math.min(width, height) * share),
  );
  const active = callActive(call);
  const status = (
    <>
      <CallStatus call={call} name={name} />
      <CallCaptions call={call} />
      <ToolLines lines={call.tools} />
    </>
  );
  const footer = <CallFooter call={call} onAgain={again} onClose={leave} />;
  return (
    <View className="flex-1 bg-bg pb-safe-offset-6 pt-safe">
      <Glow colour="primary" y="40%" radius="70%" strength={0.35} breathing={active} />
      <CallHeader call={call} onMinimise={leave} />
      {short ? (
        <View className="flex-1 flex-row items-center justify-center gap-10 px-gutter">
          <AssistantOrb state={orbStateOf(call)} level={level} size={orb} dimmed={!active} />
          <View className="w-full max-w-call flex-1 justify-center gap-4">
            {status}
            {footer}
          </View>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center gap-8 px-gutter">
          <AssistantOrb state={orbStateOf(call)} level={level} size={orb} dimmed={!active} />
          <View className="w-full items-center gap-8">{status}</View>
          <View className="w-full max-w-call items-center pt-4">{footer}</View>
        </View>
      )}
    </View>
  );
}
