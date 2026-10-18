import { describe, expect, it, vi } from 'vitest';
import type { DesktopTalkCommand } from '@smarteverything/domain';

vi.mock('expo-router', () => ({ router: { push: vi.fn(), navigate: vi.fn() } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const { HOLD_MS, SHORTCUT_IDLE, assistantShortcut, shortcutStep } =
  await import('./use-assistant-shortcut');

interface Rig {
  readonly log: string[];
  readonly send: (command: DesktopTalkCommand, after?: number) => void;
}

function rig(active: boolean): Rig {
  const log: string[] = [];
  let live = active;
  let muted = false;
  let now = 0;
  const handle = assistantShortcut({
    active: () => live,
    now: () => now,
    start: () => {
      live = true;
      log.push('start');
    },
    end: () => {
      live = false;
      log.push('end');
    },
    mute: (value) => {
      muted = value;
      log.push(value ? 'mute' : 'unmute');
    },
    muted: () => muted,
  });
  const send = (command: DesktopTalkCommand, after = 0): void => {
    now += after;
    handle(command);
  };
  return { log, send };
}

const assistant = (phase: 'press' | 'release' | 'toggle'): DesktopTalkCommand => ({
  kind: 'assistant',
  phase,
});

describe('the Talk to the AI shortcut', () => {
  it('starts a conversation on press when none is running', () => {
    const { log, send } = rig(false);
    send(assistant('press'));
    send(assistant('release'), 100);
    expect(log).toEqual(['start']);
  });

  it('ends the conversation on a press while one is running', () => {
    const { log, send } = rig(true);
    send(assistant('press'));
    expect(log).toEqual(['end']);
  });

  it('toggles on the Electron backend', () => {
    const { log, send } = rig(false);
    send(assistant('toggle'));
    send(assistant('toggle'));
    expect(log).toEqual(['start', 'end']);
  });

  it('turns a long hold that started the call into push to talk', () => {
    const { log, send } = rig(false);
    send(assistant('press'));
    send(assistant('release'), HOLD_MS);
    expect(log).toEqual(['start', 'mute']);
    send(assistant('press'), 1000);
    send(assistant('release'), 600);
    expect(log).toEqual(['start', 'mute', 'unmute', 'mute']);
  });

  it('keeps the microphone open when the starting press is short', () => {
    const { log, send } = rig(false);
    send(assistant('press'));
    send(assistant('release'), HOLD_MS - 1);
    send(assistant('press'), 1000);
    expect(log).toEqual(['start', 'end']);
  });

  it('ignores a release without a press and other talk commands', () => {
    const { log, send } = rig(true);
    send(assistant('release'));
    send({ kind: 'press' });
    send({ kind: 'open' });
    expect(log).toEqual([]);
  });
});

describe('the Mute the AI call shortcut', () => {
  it('toggles mute only while a call runs', () => {
    const running = rig(true);
    running.send({ kind: 'assistant_mute' });
    running.send({ kind: 'assistant_mute' });
    expect(running.log).toEqual(['mute', 'unmute']);
    const idle = rig(false);
    idle.send({ kind: 'assistant_mute' });
    expect(idle.log).toEqual([]);
  });
});

describe('the shortcut state machine', () => {
  it('forgets push to talk when a new call starts', () => {
    const talking = { pressedAt: null, startedHere: false, pushToTalk: true };
    expect(shortcutStep(talking, 'press', false, 5).state.pushToTalk).toBe(false);
    expect(shortcutStep(SHORTCUT_IDLE, 'release', true, 5).effect).toBe('none');
  });
});
