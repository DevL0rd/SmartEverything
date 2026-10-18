import { AppState, PermissionsAndroid } from 'react-native';
import { router } from 'expo-router';
import { background } from '@smarteverything/logging';
import {
  configureListening,
  overlayLinked,
  releaseWake,
  restListening,
  resumeListening,
  showAssistantSession,
  stopListening,
  watchListeningLevel,
} from '../../../../modules/health-connect';
import { claimPhoneWake, readPhoneEarConfig, reportPhoneEarState } from '../../../api/phone-ear';
import { connectionState } from '../../../api/connection/connection';
import { onLocalNetwork } from '../../../api/connection/local-network';
import { href } from '../../../app-shell/hrefs';
import { callActive, callState } from '../call/call-state';
import { callEngine } from '../call/engine/engine';
import { recentChatId } from '../data/recent-chat';
import { PhoneEar } from './phone-ear';

const WAKE_CALL_SOURCE = 'assistant';

const WAKE_CALL_DEVICE = 'the phone';

class EarNotPairedError extends Error {
  override readonly name = 'EarNotPairedError';

  constructor() {
    super('This phone is not paired with a home, so it cannot listen yet.');
  }
}

function paired(): { readonly url: string; readonly token: string } {
  const state = connectionState.get();
  if (state.status !== 'paired') {
    throw new EarNotPairedError();
  }
  return { url: state.connection.url, token: state.connection.token };
}

function startWakeCall(): void {
  const connection = paired();
  const chatId = recentChatId();
  if (AppState.currentState !== 'active' && overlayLinked()) {
    background(showAssistantSession(), 'phone_ear.session_failed');
  }
  callEngine.start({
    connection,
    source: WAKE_CALL_SOURCE,
    chatId,
    answering: null,
    device: WAKE_CALL_DEVICE,
  });
  if (AppState.currentState === 'active') {
    router.push(href.assistantCall(WAKE_CALL_SOURCE, chatId));
  }
}

export const phoneEar = new PhoneEar({
  native: {
    configure: (config): Promise<void> => {
      const { url, token } = paired();
      return configureListening(url, token, config);
    },
    rest: restListening,
    resume: resumeListening,
    stop: stopListening,
    releaseWake,
    watchLevel: watchListeningLevel,
  },
  hub: {
    config: readPhoneEarConfig,
    claim: claimPhoneWake,
    reportState: reportPhoneEarState,
  },
  calls: {
    phase: (): string => callState.get().phase,
    active: (): boolean => callActive(callState.get()),
    start: startWakeCall,
    end: (): void => {
      callEngine.end();
    },
  },
  environment: {
    onLocalNetwork,
    microphoneGranted: (): Promise<boolean> =>
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO),
  },
});
