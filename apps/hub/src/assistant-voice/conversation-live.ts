import { AUTOMATIC_PAUSE_MS, voiceModelFor, voiceThinkingOf } from '@smarteverything/domain';
import type { ConversationHooks } from './conversation-hooks';
import type { LiveEvents, LiveOptions } from './gemini';
import type { LiveRenewal } from './live-renewal';
import { sightWindow, type SightTuning } from './live-window';
import { streamsInput } from './speech-input';

export function liveOptionsOf(
  hooks: Pick<
    ConversationHooks,
    'speech' | 'pause' | 'listening' | 'settings' | 'window' | 'system' | 'tools' | 'webSearch'
  >,
  tuning: SightTuning | null,
  resume: string | null,
): LiveOptions {
  const settings = hooks.settings();
  const base = hooks.window();
  const thinking = voiceThinkingOf(settings.thinking_level);
  return {
    model: voiceModelFor(settings.thinking_level),
    voice: settings.voice,
    system: hooks.system(),
    tools: hooks.tools(),
    webSearch: hooks.webSearch(),
    resume,
    window: tuning === null ? base : sightWindow(tuning, base),
    automatic: streamsInput(hooks.speech) || hooks.pause?.ms() === AUTOMATIC_PAUSE_MS,
    ...(tuning === null ? {} : { resolution: tuning.resolution }),
    ...(hooks.listening?.pauseMs === undefined ? {} : { pauseMs: hooks.listening.pauseMs }),
    ...(thinking === null ? {} : { thinking }),
  };
}

export function currentEvents(
  current: () => boolean,
  renewal: LiveRenewal,
  events: Required<LiveEvents>,
): LiveEvents {
  const live =
    <A extends unknown[]>(handle: (...args: A) => void) =>
    (...args: A): void => {
      if (current()) {
        handle(...args);
      }
    };
  const served = <A extends unknown[]>(handle: (...args: A) => void): ((...args: A) => void) =>
    live((...args: A) => {
      renewal.served();
      handle(...args);
    });
  return {
    audio: served(events.audio),
    said: served(events.said),
    heard: served(events.heard),
    interrupted: served(events.interrupted),
    turnComplete: served(events.turnComplete),
    tool: served(events.tool),
    resumable: served(events.resumable),
    goAway: live(events.goAway),
    usage: events.usage,
    closed: live(events.closed),
  };
}
