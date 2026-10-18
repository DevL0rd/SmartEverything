import { useEffect } from 'react';
import type { DesktopTalkCommand } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { desktopBridge } from '../../../design/platform';
import { callActive, callState } from '../call/call-state';
import { callEngine } from '../call/engine/engine';
import { startCall } from '../call/start-call';
import { startWake } from './overlay-state';

const log = new Logger('app.assistant-shortcut');

export const HOLD_MS = 400;

export interface ShortcutState {
  readonly pressedAt: number | null;
  readonly startedHere: boolean;
  readonly pushToTalk: boolean;
}

export type ShortcutPhase = 'press' | 'release' | 'toggle';

type ShortcutEffect = 'start' | 'end' | 'mute' | 'unmute' | 'none';

export const SHORTCUT_IDLE: ShortcutState = {
  pressedAt: null,
  startedHere: false,
  pushToTalk: false,
};

interface Step {
  readonly state: ShortcutState;
  readonly effect: ShortcutEffect;
}

function pressed(state: ShortcutState, active: boolean, now: number): Step {
  if (!active) {
    return { state: { pressedAt: now, startedHere: true, pushToTalk: false }, effect: 'start' };
  }
  if (state.pushToTalk) {
    return { state: { ...state, pressedAt: now }, effect: 'unmute' };
  }
  return { state: SHORTCUT_IDLE, effect: 'end' };
}

function released(state: ShortcutState, active: boolean, now: number): Step {
  const { pressedAt } = state;
  if (pressedAt === null || !active) {
    return { state: { ...state, pressedAt: null, startedHere: false }, effect: 'none' };
  }
  const longHold = state.startedHere && now - pressedAt >= HOLD_MS;
  if (state.pushToTalk || longHold) {
    return { state: { pressedAt: null, startedHere: false, pushToTalk: true }, effect: 'mute' };
  }
  return { state: { ...state, pressedAt: null, startedHere: false }, effect: 'none' };
}

export function shortcutStep(
  state: ShortcutState,
  phase: ShortcutPhase,
  active: boolean,
  now: number,
): Step {
  if (phase === 'toggle') {
    return active
      ? { state: SHORTCUT_IDLE, effect: 'end' }
      : { state: SHORTCUT_IDLE, effect: 'start' };
  }
  return phase === 'press' ? pressed(state, active, now) : released(state, active, now);
}

export interface ShortcutPorts {
  readonly active: () => boolean;
  readonly now: () => number;
  readonly start: () => void;
  readonly end: () => void;
  readonly mute: (muted: boolean) => void;
  readonly muted: () => boolean;
}

export function assistantShortcut(ports: ShortcutPorts): (command: DesktopTalkCommand) => void {
  let state = SHORTCUT_IDLE;
  const run: Readonly<Record<ShortcutEffect, () => void>> = {
    start: ports.start,
    end: ports.end,
    mute: () => {
      ports.mute(true);
    },
    unmute: () => {
      ports.mute(false);
    },
    none: () => undefined,
  };
  return (command) => {
    if (command.kind === 'assistant_mute') {
      if (ports.active()) {
        ports.mute(!ports.muted());
      }
      return;
    }
    if (command.kind !== 'assistant') {
      return;
    }
    const step = shortcutStep(state, command.phase, ports.active(), ports.now());
    state = step.state;
    run[step.effect]();
  };
}

const CALL_PORTS: ShortcutPorts = {
  active: () => callActive(callState.get()),
  now: Date.now,
  start: () => {
    startWake();
    startCall({ source: 'shortcut' });
  },
  end: () => {
    callEngine.end();
  },
  mute: (muted) => {
    callEngine.mute(muted);
  },
  muted: () => callState.get().muted,
};

export function useAssistantShortcut(): void {
  useEffect(() => {
    const bridge = desktopBridge();
    if (bridge?.onTalkCommand === undefined) {
      log.debug('shortcut.unavailable');
      return undefined;
    }
    return bridge.onTalkCommand(assistantShortcut(CALL_PORTS));
  }, []);
}
