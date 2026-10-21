import { Logger } from '@smarteverything/logging';
import { LogTally } from '../design/log-tally';
import type { EntityStore } from './entity-store';
import type { LiveNotice } from './notice-registry';
import { withFrame, withSnapshot } from './chat-turns';
import { runPushCommandNotice } from './push-command-notice';
import { deliverAiSpeech } from './ai-speech-requests';
import { deliverAppView } from './app-view-requests';
import { automationTrace } from '../features/automations/data/trace-channel';
const log = new Logger('app.live');
const applied = new LogTally(log, 'notices.applied', 5000);
type NoticeMap = { readonly [K in LiveNotice['type']]: Extract<LiveNotice, { readonly type: K }> };

type NoticeHandler<K extends LiveNotice['type']> = (
  store: EntityStore,
  message: NoticeMap[K],
) => void;

function setHub(store: EntityStore, message: NoticeMap['ready' | 'presence']): void {
  store.update((state) => ({ ...state, hub: message.hub }));
}

const NOTICES: { readonly [K in LiveNotice['type']]: NoticeHandler<K> } = {
  ready: setHub,
  transcript_changed: ignoreNotice,
  listening_changed: ignoreNotice,
  listening_level: ignoreNotice,
  wake_test_heard: ignoreNotice,
  listening_ear: ignoreNotice,
  voice_activity: ignoreNotice,
  voice_levels: ignoreNotice,
  voice_calls: ignoreNotice,
  voice_caption: ignoreNotice,
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
  assistant_status: ignoreNotice,
  chat_activity: (store, message) => {
    store.update((state) => ({ ...state, turns: withSnapshot(state.turns, message) }));
  },
  chat_stream: (store, message) => {
    store.update((state) => ({ ...state, turns: withFrame(state.turns, message) }));
  },
  ai_speech: (_store, message) => {
    log.info('live.ai_speech', { listeners: deliverAiSpeech(message) });
  },
  app_view: (_store, message) => {
    log.info('live.app_view', {
      action: message.request.action,
      listeners: deliverAppView(message.request),
    });
  },
  push_command: (_store, message) => {
    runPushCommandNotice(message);
  },
  notification: ignoreNotice,
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
  computer_live: ignoreNotice,
  phone_detail: ignoreNotice,
  treadmill_live: ignoreNotice,
  toothbrush_live: ignoreNotice,
  clipboard: ignoreNotice,
  trace_keyframe: deliverTrace,
  trace_node_state: deliverTrace,
  trace_run_parked: deliverTrace,
  trace_run_finished: deliverTrace,
};

function deliverTrace(_store: EntityStore, message: unknown): void {
  automationTrace.deliver(message);
}

function ignoreNotice(): void {
  return undefined;
}

export function noticeTo<K extends LiveNotice['type']>(
  store: EntityStore,
  type: K,
  message: NoticeMap[K],
): void {
  const handle: NoticeHandler<K> = NOTICES[type];
  applied.bump(type);
  if (type === 'ready' || type === 'firewall') log.info('live.notice_applied', { type });
  handle(store, message);
}
