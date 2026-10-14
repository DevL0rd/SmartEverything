import type { LiveMessage } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { EntityStore } from './entity-store';
import { withFrame, withSnapshot } from './chat-turns';
import { runPushCommand } from '../../modules/health-connect';
import { deliverAiSpeech } from './ai-speech-requests';
import {
  refreshResponseStyle,
  mergeResponseStyle,
  responseStyleSupported,
} from './assistant-response-style';
const log = new Logger('app.live');
type Notice = Exclude<LiveMessage, { type: 'change' | 'subscribed' | 'profile_changed' }>;

type NoticeMap = { readonly [K in Notice['type']]: Extract<Notice, { readonly type: K }> };

type NoticeHandler<K extends Notice['type']> = (store: EntityStore, message: NoticeMap[K]) => void;

function setHub(store: EntityStore, message: NoticeMap['ready' | 'presence']): void {
  store.update((state) => ({ ...state, hub: message.hub }));
}

const NOTICES: { readonly [K in Notice['type']]: NoticeHandler<K> } = {
  ready: setHub,
  ai_preview: ignoreNotice,
  ai_harness: ignoreNotice,
  ai_harness_configuration: ignoreNotice,
  image_operation: ignoreNotice,
  image_operation_preview: ignoreNotice,
  presence: setHub,
  firewall: (store, message) => {
    store.update((state) => ({ ...state, firewall: message.firewall }));
  },
  refused: (store, message) => {
    log.warn('live.refused', { code: message.error.code, reason: message.error.message });
    store.setSync({ status: 'refused', problem: message.error.message });
  },
  mcp_consent: (store, message) => {
    store.update((state) => ({
      ...state,
      consentRequests: [
        ...state.consentRequests.filter((request) => request.id !== message.request.id),
        message.request,
      ],
    }));
  },
  mcp_consent_closed: (store, message) => {
    store.update((state) => ({
      ...state,
      consentRequests: state.consentRequests.filter((request) => request.id !== message.id),
    }));
  },
  smartthings_webhook: (store, message) => {
    store.update((state) => ({ ...state, smartthingsWebhook: message.webhook }));
  },
  service_log: (store, message) => {
    store.appendLog(message.lines);
  },
  talk_floors: (store, message) => {
    store.update((state) => ({
      ...state,
      talkPresence: { floors: message.floors, online: message.online },
    }));
  },
  assistant_status: (store, message) => {
    const supported = responseStyleSupported();
    store.update((state) => ({
      ...state,
      assistant: mergeResponseStyle(message.status, state.assistant),
    }));
    if (supported) void refreshResponseStyle(store);
  },
  chat_activity: (store, message) => {
    store.update((state) => ({ ...state, turns: withSnapshot(state.turns, message) }));
  },
  chat_stream: (store, message) => {
    store.update((state) => ({ ...state, turns: withFrame(state.turns, message) }));
  },
  ai_speech: (_store, message) => {
    log.info('live.ai_speech', { listeners: deliverAiSpeech(message) });
  },
  push_command: (_store, message) => {
    runPushCommand(message.command, JSON.stringify(message.payload)).catch((error: unknown) => {
      log.error('live.push_command_failed', error, { command: message.command });
    });
  },
  watch_action: (_store, message) => {
    log.warn('live.legacy_watch_action_ignored', { requestId: message.requestId });
  },
  claude_operation: ignoreNotice,
  claude_session: ignoreNotice,
  claude_session_gone: ignoreNotice,
  claude_thread: ignoreNotice,
  claude_status: ignoreNotice,
  computer_ai_status: ignoreNotice,
  computer_claude: ignoreNotice,
  ai_chat_provider: ignoreNotice,
  ai_chat_runtime_provider: ignoreNotice,
  computer_runtime_status: ignoreNotice,
  computer_runtime_native: ignoreNotice,
};

function ignoreNotice(): void {
  return undefined;
}

export function noticeTo<K extends Notice['type']>(
  store: EntityStore,
  type: K,
  message: NoticeMap[K],
): void {
  const handle: NoticeHandler<K> = NOTICES[type];
  handle(store, message);
}

export function isRuntimeComputerNotice(message: LiveMessage): message is Extract<
  LiveMessage,
  {
    type:
      | 'computer_ai_status'
      | 'computer_claude'
      | 'computer_runtime_status'
      | 'computer_runtime_native';
  }
> {
  return (
    message.type === 'computer_ai_status' ||
    message.type === 'computer_claude' ||
    message.type === 'computer_runtime_status' ||
    message.type === 'computer_runtime_native'
  );
}
