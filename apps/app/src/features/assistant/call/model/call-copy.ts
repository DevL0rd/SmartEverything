import type { CallEnding, SightMode, SightSource } from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';
import { callActive, type CallView } from '../call-state';

export const ENDINGS: Readonly<Record<CallEnding, string>> = {
  hung_up: 'Call ended',
  finished: 'Call ended',
  idle: 'Ended after a quiet minute',
  failed: 'Call didn’t work',
  replaced: 'Moved to another call',
  disconnected: 'Connection lost',
};

export const SHARING_STOPPED = 'Screen sharing stopped';

export const RECONNECT_HINT = 'Your home connection dropped. Hold on.';

function liveStatusOf(call: CallView, name: string): string {
  switch (call.phase) {
    case 'listening':
      return call.muted ? 'Muted' : 'Listening';
    case 'thinking':
      return 'Working on it…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'speaking':
      return name;
    case 'ended':
      return call.ending === null ? 'Call ended' : ENDINGS[call.ending];
    case 'idle':
    case 'connecting':
      return 'Connecting…';
  }
}

export function statusOf(call: CallView, name: string): string {
  return call.echoTest.status === 'running' ? 'Testing echo…' : liveStatusOf(call, name);
}

export function sublineOf(call: CallView, name: string, elapsed: string): string {
  if (!callActive(call)) {
    if (call.problem !== null) {
      return call.problem;
    }
    return call.sharedAtEnd ? SHARING_STOPPED : name;
  }
  if (call.echoTest.status === 'running') {
    return `${name} can’t hear you for a moment`;
  }
  if (call.phase === 'reconnecting') {
    return RECONNECT_HINT;
  }
  return `${name} · ${elapsed}`;
}

interface SourceCopy {
  readonly title: string;
  readonly icon: IconName;
  readonly noun: string;
}

const SOURCE_COPY: Readonly<Record<SightSource, SourceCopy>> = {
  home_camera: { title: 'Home camera', icon: 'camera', noun: 'camera' },
  phone_camera: { title: 'Camera', icon: 'camera', noun: 'camera' },
  phone_screen: { title: 'Screen', icon: 'screenShare', noun: 'screen' },
  desktop_screen: { title: 'Screen', icon: 'screenShare', noun: 'screen' },
  desktop_window: { title: 'Window', icon: 'appWindow', noun: 'window' },
};

export function sourceTitleOf(source: SightSource, label: string | null): string {
  return source === 'home_camera' || source === 'desktop_window'
    ? (label ?? SOURCE_COPY[source].title)
    : SOURCE_COPY[source].title;
}

export function sourceIconOf(source: SightSource): IconName {
  return SOURCE_COPY[source].icon;
}

export function isScreenSource(source: SightSource): boolean {
  return source === 'phone_screen' || source === 'desktop_screen' || source === 'desktop_window';
}

export function sightPillText(source: SightSource, label: string | null, mode: SightMode): string {
  const title = sourceTitleOf(source, label);
  return mode === 'on_demand' ? `${title} · on request` : title;
}

export function stopSightLabel(source: SightSource, label: string | null): string {
  return isScreenSource(source)
    ? 'Stop sharing screen'
    : `Stop sharing ${sourceTitleOf(source, label).toLowerCase()}`;
}

export function lookedAtText(label: string): string {
  return `AI looked at ${label}`;
}

export function consentTitle(name: string, source: SightSource, target: string | null): string {
  switch (source) {
    case 'phone_camera':
      return `${name} wants to see your camera`;
    case 'home_camera':
      return `${name} wants to look at ${target ?? 'a home camera'}`;
    case 'phone_screen':
    case 'desktop_screen':
      return `${name} wants to see your screen`;
    case 'desktop_window':
      return `${name} wants to see ${target ?? 'a window'}`;
  }
}

export function consentAccept(source: SightSource): string {
  return isScreenSource(source) ? 'Show screen' : 'Show camera';
}
