import { describe, expect, it } from 'vitest';
import type { BindingProblem } from '../commands/dsh-binding';
import { searchReason } from './reason';

const PROBLEMS: readonly BindingProblem[] = [
  'offline',
  'preparing',
  'machine-offline',
  'machine-outdated',
  'not-ready',
  'failed',
];

describe('searchReason', () => {
  it('is offline when the session is not ready', () => {
    expect(searchReason('openrouter', false, null)?.kind).toBe('offline');
  });

  it('waits for the chat', () => {
    expect(searchReason(undefined, true, null)).toEqual({
      kind: 'other',
      text: 'Preparing this chat…',
    });
  });

  it('offers another model for chats that cannot mention anything', () => {
    expect(searchReason('codex', true, null)).toEqual({
      kind: 'unsupported',
      text: 'Codex can’t use references.',
    });
  });

  it('lets Claude chats search without waiting for a harness session', () => {
    expect(searchReason('claude', true, 'preparing')).toBeNull();
    expect(searchReason('claude', false, null)?.kind).toBe('offline');
  });

  it('allows searching when nothing blocks', () => {
    expect(searchReason('openrouter', true, null)).toBeNull();
  });

  it.each(PROBLEMS)('words the %s binding problem as references copy', (problem) => {
    const reason = searchReason('openrouter', true, problem);
    expect(reason?.text).toMatch(/reference/i);
    expect(reason?.text.toLowerCase()).not.toContain('command');
    expect(reason?.kind).toBe(problem === 'offline' ? 'offline' : 'other');
  });
});
