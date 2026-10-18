import type { ConversationHooks } from './conversation-hooks';
import type { LiveEvents, LiveOptions } from './gemini';
import type { LiveRenewal } from './live-renewal';
import { sightWindow, type SightTuning } from './live-window';
import { streamsInput } from './speech-input';

export function liveOptionsOf(
  hooks: ConversationHooks,
  tuning: SightTuning | null,
  resume: string | null,
): LiveOptions {
  const settings = hooks.settings();
  const base = hooks.window();
  return {
    model: settings.model,
    voice: settings.voice,
    system: hooks.system(),
    tools: hooks.tools(),
    webSearch: hooks.webSearch(),
    resume,
    window: tuning === null ? base : sightWindow(tuning, base),
    automatic: streamsInput(hooks.speech),
    ...(tuning === null ? {} : { resolution: tuning.resolution }),
    ...(hooks.listening?.pauseMs === undefined ? {} : { pauseMs: hooks.listening.pauseMs }),
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
