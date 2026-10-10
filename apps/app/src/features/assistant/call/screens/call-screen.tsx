import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { CALL_SOURCE, type CallSource } from '@smarteverything/domain';
import { z } from 'zod';
import { useConnection } from '../../../../api/transport';
import { appPlatform } from '../../../../design/platform';
import { callActive, callState, useCall, type CallView } from '../call-state';
import { callEngine } from '../engine/engine';
import { CallRoom } from './call-room';

const DEVICE_LABELS = {
  android: 'the phone',
  desktop: 'the computer',
  web: 'the browser',
} as const;

const CLOSE_AFTER_MS = 900;

const ID = z.uuid();

const ACTIONS = z.enum(['camera', 'share', 'home', 'settings']);

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
  readonly action: string | null;
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
  const params = useLocalSearchParams<{
    source?: string;
    chatId?: string;
    answering?: string;
    action?: string;
  }>();
  return useMemo(() => {
    const action = ACTIONS.safeParse(params.action);
    return {
      source: sourceOf(params.source),
      chatId: idOf(params.chatId),
      answering: idOf(params.answering),
      action: action.success ? action.data : null,
    };
  }, [params.source, params.chatId, params.answering, params.action]);
}

export function CallScreen(): ReactNode {
  const call = useCall();
  const opening = useOpening();
  const again = useStartOnOpen(opening);
  useCloseWhenHungUp(call);
  return <CallRoom action={opening.action} onAgain={again} onLeave={leave} />;
}
