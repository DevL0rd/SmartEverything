import { describe, expect, it } from 'vitest';
import { ENGINE, type Engine } from '@smarteverything/domain';
import type { Turn, Turns } from '../../../store/chat-turns';
import { chatCounts, chatsLine, machineOf, type MachineChat } from './chat-machine';

const HERE = '11111111-1111-4111-8111-111111111111';
const ELSEWHERE = '22222222-2222-4222-8222-222222222222';
const ROUTE = '33333333-3333-4333-8333-333333333333';

function claude(deviceId: string): Engine {
  return ENGINE.parse({ kind: 'claude', device_id: deviceId, model: 'sonnet' });
}

function boundTo(target: object): Engine {
  return ENGINE.parse({
    kind: 'dsh',
    execution_target: target,
    session_id: null,
    model_route_id: ROUTE,
    model: 'sonnet',
  });
}

function chat(id: string, engine: Engine, change: Partial<MachineChat> = {}): MachineChat {
  return { id, kind: 'chat', engine, archived_at: null, deletion_state: null, ...change };
}

function working(chatId: string): Turn {
  return {
    chatId,
    turnId: `turn-${chatId}`,
    messageId: null,
    state: 'thinking',
    seq: 1,
    text: '',
    reasoning: '',
    tools: [],
    steps: [],
    reason: null,
    behind: false,
    waiting: [],
  };
}

describe('machineOf', () => {
  it('names the computer a Claude or device-bound chat runs on', () => {
    expect(machineOf(claude(HERE))).toBe(HERE);
    expect(machineOf(boundTo({ kind: 'device', device_id: ELSEWHERE }))).toBe(ELSEWHERE);
  });

  it('names no computer for hub and server chats', () => {
    expect(machineOf(ENGINE.parse({ kind: 'openrouter' }))).toBeNull();
    expect(machineOf(boundTo({ kind: 'server' }))).toBeNull();
  });
});

describe('chatCounts', () => {
  const chats = [
    chat('a', claude(HERE)),
    chat('b', claude(HERE)),
    chat('c', claude(ELSEWHERE)),
    chat('d', claude(HERE), { archived_at: '2026-10-01T00:00:00.000Z' }),
    chat('e', claude(HERE), { kind: 'subagent' }),
  ];
  const turns: Turns = { a: working('a'), c: working('c') };

  it('counts live chats on one computer and those working now', () => {
    expect(chatCounts(chats, turns, HERE)).toEqual({ running: 1, total: 2 });
  });

  it('words the count', () => {
    expect(chatsLine({ running: 0, total: 0 })).toBe('No chats yet');
    expect(chatsLine({ running: 0, total: 1 })).toBe('1 chat');
    expect(chatsLine({ running: 3, total: 14 })).toBe('3 running · 14 chats');
  });
});
