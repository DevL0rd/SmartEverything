import { Logger } from '@smarteverything/logging';
import {
  addTalkStateListener,
  configureTalk,
  listenTalk,
  pressTalk,
  releaseTalk,
  startTalk,
  stopTalk,
  talkLinked,
} from '../../../../modules/health-connect';
import { notify } from '../../../components/toast-store';
import { rawErrorText } from '../../../format/errors';
import { setLocalPref } from '../../../store/local-prefs';
import { IDLE_TRANSMIT, engineState, type TalkEngine } from './engine-state';

const log = new Logger('app.talk-engine');

function failed(action: string): (error: unknown) => void {
  return (error) => {
    log.warn('talk.native_failed', { action, reason: rawErrorText(error) });
    notify({ message: 'Walkie-talkie didn’t respond', error, tone: 'critical' });
  };
}

let subscription: { readonly remove: () => void } | null = null;

function follow(): void {
  subscription?.remove();
  subscription = addTalkStateListener(({ talkChannel, ...state }) => {
    engineState.set(state);
    setLocalPref('talkChannel', talkChannel);
  });
}

export const talkEngine: TalkEngine = {
  supported: () =>
    talkLinked() ? null : 'Install the newest SmartEverything app to use the walkie-talkie.',
  start: (connection) => {
    follow();
    configureTalk(connection.url, connection.token)
      .then(() => startTalk())
      .catch(failed('start'));
  },
  stop: () => {
    subscription?.remove();
    subscription = null;
    stopTalk().catch(failed('stop'));
    engineState.update((state) => ({
      ...state,
      link: 'off',
      transmit: IDLE_TRANSMIT,
      receive: null,
    }));
  },
  press: (channelId) => {
    pressTalk(channelId).catch(failed('press'));
  },
  listen: (channelId, cameraId) => {
    listenTalk(channelId, cameraId).catch(failed('listen'));
  },
  release: () => {
    releaseTalk().catch(failed('release'));
  },
  leaveLive: () => {
    releaseTalk().catch(failed('leave'));
  },
};
