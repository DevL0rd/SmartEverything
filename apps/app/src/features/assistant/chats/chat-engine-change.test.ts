import { describe, expect, it } from 'vitest';
import { ENGINE, type Engine } from '@smarteverything/domain';
import { nativeModelKey } from '../provider/computer-engine';
import { branchModelName, branchesOnPick, engineChangeOf } from './chat-engine-change';

const DEVICE = '0b3f4c1e-5d7a-4e0b-9a41-6a6d2f0c8a11';
const ROUTE = '7c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const SESSION = 'dsh_0b3f4c1e5d7a4e0b9a416a6d2f0c8a11';

const hub = (session: string | null): Engine =>
  ENGINE.parse({
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: session,
    model_route_id: ROUTE,
    model: 'sonnet',
  });
const native = ENGINE.parse({ kind: 'claude', device_id: DEVICE, model: 'opus' });
const openrouter = ENGINE.parse({ kind: 'openrouter', model: 'openai/gpt-5' });

describe('choosing a model in a chat', () => {
  it('changes the engine directly while the chat has no running session', () => {
    expect(engineChangeOf(hub(null), native)).toBe('direct');
    expect(engineChangeOf(openrouter, native)).toBe('direct');
  });

  it('hands off when a bound chat stays on the SmartEverything runtime', () => {
    expect(engineChangeOf(hub(SESSION), hub(SESSION))).toBe('handoff');
  });

  it('continues in a new branch when a bound chat moves to another family', () => {
    expect(engineChangeOf(hub(SESSION), native)).toBe('branch');
    expect(engineChangeOf(hub(SESSION), openrouter)).toBe('branch');
  });

  it('labels only the other-family rows of a bound chat in advance', () => {
    const key = nativeModelKey('claude', 'opus');
    expect(branchesOnPick(hub(SESSION), key)).toBe(true);
    expect(branchesOnPick(hub(SESSION), `dsh:${ROUTE}:sonnet`)).toBe(false);
    expect(branchesOnPick(hub(null), key)).toBe(false);
    expect(branchesOnPick(native, key)).toBe(false);
  });
});

describe('naming the model a branch continues with', () => {
  const computers = [
    { runtime: 'claude', device_id: DEVICE, models: [{ id: 'opus', name: 'Claude Opus' }] },
  ];

  it('uses the computer’s own model name', () => {
    expect(branchModelName(native, computers)).toBe('Claude Opus');
  });

  it('uses the model id before the catalogue loads', () => {
    expect(branchModelName(openrouter, undefined)).toBe('gpt-5');
  });
});
