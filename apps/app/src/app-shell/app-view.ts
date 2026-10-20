import type { Href } from 'expo-router';
import {
  APP_VIEW_ANSWER_SECONDS,
  type AppViewRequest,
  type AppViewResult,
  type NavTarget,
} from '@smarteverything/domain';
import type { StoreState } from '../store/state';
import { anchorKeysOf } from './highlight-targets';
import { navTargetHref, targetFactsOf } from './nav-targets';

export interface HighlightPort {
  readonly present: (keys: readonly string[]) => boolean;
  readonly show: (keys: readonly string[], until: AbortSignal) => Promise<boolean>;
  readonly clear: () => void;
}

export interface AppViewPorts {
  readonly inFront: () => boolean;
  readonly state: () => StoreState;
  readonly navigate: (target: Href) => void;
  readonly highlight: HighlightPort;
}

type HighlightReason = Extract<AppViewResult, { readonly ok: true }>['reason'];

const SHOW_DEADLINE_MS = (APP_VIEW_ANSWER_SECONDS - 1) * 1000;

function nothingShown(reason: HighlightReason): AppViewResult {
  return { ok: true, opened: null, highlighted: false, reason };
}

async function showBefore(show: HighlightPort['show'], keys: readonly string[]): Promise<boolean> {
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort();
  }, SHOW_DEADLINE_MS);
  try {
    return await show(keys, deadline.signal);
  } finally {
    clearTimeout(timer);
  }
}

function wantsHighlight(target: NavTarget, focus: string | null): boolean {
  return focus !== null || target.kind === 'setting';
}

async function open(request: AppViewRequest, ports: AppViewPorts): Promise<AppViewResult> {
  const { target, focus } = request;
  if (target === null || target.kind === 'nav') {
    return { ok: false, reason: 'target_not_found' };
  }
  const destination = navTargetHref(target);
  const { title } = targetFactsOf(target, ports.state());
  if (destination === null || title === null) {
    return { ok: false, reason: 'target_not_found' };
  }
  ports.navigate(destination);
  const keys = anchorKeysOf(target, focus);
  const shown =
    wantsHighlight(target, focus) && keys.length > 0
      ? await showBefore(ports.highlight.show, keys)
      : false;
  return {
    ok: true,
    opened: title,
    highlighted: shown,
    reason: shown || focus === null ? null : 'unknown_focus',
  };
}

async function highlight(request: AppViewRequest, ports: AppViewPorts): Promise<AppViewResult> {
  const { target, focus } = request;
  if (target === null) {
    return { ok: false, reason: 'target_not_found' };
  }
  const keys = anchorKeysOf(target, focus);
  if (!ports.highlight.present(keys)) {
    return nothingShown('not_on_screen');
  }
  const shown = await showBefore(ports.highlight.show, keys);
  return { ok: true, opened: null, highlighted: shown, reason: shown ? null : 'not_on_screen' };
}

export function appViewResult(
  request: AppViewRequest,
  ports: AppViewPorts,
): Promise<AppViewResult> {
  if (!ports.inFront()) {
    return Promise.resolve({ ok: false, reason: 'app_not_in_front' });
  }
  switch (request.action) {
    case 'open':
      return open(request, ports);
    case 'highlight':
      return highlight(request, ports);
    case 'dismiss':
      ports.highlight.clear();
      return Promise.resolve(nothingShown(null));
  }
}
