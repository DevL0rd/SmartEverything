import { useEffect, useRef, useState } from 'react';
import { TUYA_CREDENTIALS } from '@smarteverything/domain';
import { cancelProviderLink } from '../../../api/providers';
import { notifyFailure } from '../../../components/toast-store';
import { useProviderLink } from '../../../store/selectors';
import { trackConnection } from '../connections-log';
import { resendOf, startOf, type TuyaFailureAction } from '../model/tuya-link';
import { useLinkFlow, type LinkFlow } from './use-link-flow';

export interface TuyaLink {
  readonly flow: LinkFlow;
  readonly code: string;
  readonly setCode: (code: string) => void;
  readonly codeReady: boolean;
  readonly scanOnly: boolean;
  readonly submitCode: () => void;
  readonly requestScan: () => void;
  readonly differentAccount: () => void;
  readonly act: (action: TuyaFailureAction) => void;
}

function credentialsOf(
  userCode: string | undefined,
): ReturnType<typeof TUYA_CREDENTIALS.safeParse> {
  return TUYA_CREDENTIALS.safeParse({
    provider: 'tuya',
    method: 'smart_life',
    ...(userCode === undefined ? {} : { userCode }),
  });
}

function useSend(flow: LinkFlow): (userCode: string | undefined) => void {
  return (userCode) => {
    const parsed = credentialsOf(userCode);
    if (parsed.success) {
      flow.start(parsed.data);
    }
  };
}

function useAutoScan(scanOnly: boolean, flow: LinkFlow, send: (code: undefined) => void): void {
  const requested = useRef(false);
  useEffect(() => {
    if (scanOnly && flow.stage.kind === 'form' && !requested.current) {
      requested.current = true;
      send(undefined);
    }
  }, [scanOnly, flow, send]);
}

export function useTuyaLink(): TuyaLink {
  const flow = useLinkFlow('tuya');
  const row = useProviderLink('tuya');
  const [code, setCode] = useState('');
  const [different, setDifferent] = useState(false);
  const scanOnly = startOf(row, different) === 'scan';
  const typed = code.trim() === '' ? undefined : code;
  const send = useSend(flow);
  useAutoScan(scanOnly, flow, send);
  const act = (action: TuyaFailureAction): void => {
    if (action === 'enter_code') {
      setDifferent(true);
    }
    flow.restart();
    const resend = resendOf(action, scanOnly);
    if (resend === 'typed') {
      send(typed);
    } else if (resend === 'stored') {
      send(undefined);
    }
  };
  const differentAccount = (): void => {
    trackConnection('provider.link_cancel', { provider: 'tuya' }, () =>
      cancelProviderLink('tuya'),
    ).then(() => {
      act('enter_code');
    }, notifyFailure('Sign-in didn’t stop'));
  };
  return {
    flow,
    code,
    setCode,
    codeReady: typed !== undefined && credentialsOf(typed).success,
    scanOnly,
    submitCode: (): void => {
      send(typed);
    },
    requestScan: (): void => {
      send(undefined);
    },
    differentAccount,
    act,
  };
}
