import { AccessibilityInfo } from 'react-native';
import type { OverlayView } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { ValueStore } from '../../../design/external-store';
import { desktopBridge } from '../../../design/platform';

export interface Notice {
  readonly title: string;
  readonly body: string;
}

export interface AnnouncePorts {
  readonly say: (text: string) => void;
  readonly notify: (notice: Notice) => void;
  readonly windowHidden: () => boolean;
  readonly shortcut: () => string | null;
}

export const answerShortcut = new ValueStore<string | null>(null);

function answerHint(shortcut: string | null): string | null {
  return shortcut === null ? null : `Press ${shortcut} to answer`;
}

function joined(first: string, second: string | null): string {
  return second === null ? first : `${first}. ${second}`;
}

function shownState(view: OverlayView | null): OverlayView['state'] | null {
  return view === null || view.state === 'hidden' ? null : view.state;
}

const SPOKEN_STATES: readonly OverlayView['state'][] = ['wake', 'superseded', 'ended'];

function stateAnnouncement(previous: OverlayView | null, next: OverlayView): string | null {
  if (shownState(previous) === next.state) {
    return null;
  }
  if (next.state === 'error') {
    return joined(next.status, next.caption);
  }
  return SPOKEN_STATES.includes(next.state) ? next.status : null;
}

function newRequest(previous: OverlayView | null, next: OverlayView): OverlayView['request'] {
  const { request } = next;
  return request === null || previous?.request?.title === request.title ? null : request;
}

function requestAnnouncement(
  previous: OverlayView | null,
  next: OverlayView,
  shortcut: string | null,
): string | null {
  const request = newRequest(previous, next);
  if (request === null) {
    return null;
  }
  const asked = joined(request.title, request.why === '' ? null : request.why);
  const hint = answerHint(shortcut);
  return hint === null ? asked : joined(asked, hint);
}

function requestNoticeOf(
  previous: OverlayView | null,
  next: OverlayView,
  shortcut: string | null,
): Notice | null {
  const request = newRequest(previous, next);
  if (request === null) {
    return null;
  }
  const hint = answerHint(shortcut);
  const body = request.why === '' ? (hint ?? '') : joined(request.why, hint);
  return { title: request.title, body };
}

export function noticeOf(previous: OverlayView | null, next: OverlayView): Notice | null {
  if (next.state !== 'error' || shownState(previous) === 'error') {
    return null;
  }
  return { title: next.status, body: next.caption ?? '' };
}

export function announceOverlay(
  previous: OverlayView | null,
  next: OverlayView,
  ports: AnnouncePorts,
): void {
  const shortcut = ports.shortcut();
  const spoken = [stateAnnouncement(previous, next), requestAnnouncement(previous, next, shortcut)];
  for (const text of spoken) {
    if (text !== null) {
      ports.say(text);
    }
  }
  const notices = [noticeOf(previous, next), requestNoticeOf(previous, next, shortcut)];
  if (ports.windowHidden()) {
    notices.forEach((notice) => {
      if (notice !== null) {
        ports.notify(notice);
      }
    });
  }
}

export function overlayAnnouncePorts(
  windowHidden: () => boolean,
  shortcut: () => string | null,
): AnnouncePorts {
  return {
    say: (text): void => {
      AccessibilityInfo.announceForAccessibility(text);
    },
    notify: (notice): void => {
      background(desktopBridge()?.notify(notice), 'overlay.notify_failed');
    },
    windowHidden,
    shortcut,
  };
}
