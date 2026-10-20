import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { closeFlow } from '../../../../app-shell/close-flow';
import { CALL_SOURCE, type CallSource } from '@smarteverything/domain';
import { z } from 'zod';
import { useConnection } from '../../../../api/transport';
import { appPlatform } from '../../../../design/platform';
import { canMinimizeCall, minimizeCall } from '../../overlay/overlay-minimize';
import { callActive, callState } from '../call-state';
import { callEngine } from '../engine/engine';
import { CallRoom } from './call-room';

const DEVICE_LABELS = {
  android: 'the phone',
  desktop: 'the computer',
  web: 'the browser',
} as const;

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
  closeFlow('/');
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
  const opening = useOpening();
  const again = useStartOnOpen(opening);
  return (
    <CallRoom
      action={opening.action}
      onAgain={again}
      onLeave={leave}
      onMinimise={canMinimizeCall() ? minimizeCall : null}
    />
  );
}
