import { describe, expect, it } from 'vitest';
import {
  lastReplyFailed,
  queuedCount,
  sublineOf,
  sublineText,
  type SublineInput,
} from './chat-subline';

const idle: SublineInput = {
  working: false,
  step: null,
  needsYou: false,
  waiting: 0,
  queued: 0,
  switching: false,
  reconnecting: false,
  failed: false,
  lead: null,
};

describe('sublineOf', () => {
  it('is empty when nothing is going on and the chat started in the app', () => {
    expect(sublineOf(idle)).toEqual({ kind: 'none' });
  });

  it('shows where the chat came from when idle', () => {
    expect(sublineOf({ ...idle, lead: 'From Discord' })).toEqual({
      kind: 'lead',
      text: 'From Discord',
    });
  });

  it('shows the working step', () => {
    expect(sublineOf({ ...idle, working: true, step: 'Running tests' })).toEqual({
      kind: 'working',
      step: 'Running tests',
    });
  });

  it('puts a request that needs the person ahead of the work it is blocking', () => {
    expect(sublineOf({ ...idle, working: true, needsYou: true, waiting: 2 })).toEqual({
      kind: 'needs-you',
    });
  });

  it('ranks the remaining statuses in order', () => {
    const everything = {
      ...idle,
      waiting: 2,
      queued: 3,
      switching: true,
      reconnecting: true,
      failed: true,
      lead: 'x',
    };
    expect(sublineOf(everything)).toEqual({ kind: 'waiting', count: 2 });
    expect(sublineOf({ ...everything, waiting: 0 })).toEqual({ kind: 'queued', count: 3 });
    expect(sublineOf({ ...everything, waiting: 0, queued: 0 })).toEqual({ kind: 'switching' });
    expect(sublineOf({ ...everything, waiting: 0, queued: 0, switching: false })).toEqual({
      kind: 'reconnecting',
    });
    expect(
      sublineOf({ ...everything, waiting: 0, queued: 0, switching: false, reconnecting: false }),
    ).toEqual({ kind: 'failed' });
    expect(sublineOf({ ...idle, failed: false, lead: 'x' })).toEqual({ kind: 'lead', text: 'x' });
  });
});

describe('sublineText', () => {
  it('uses the status words of the design', () => {
    expect(sublineText({ kind: 'needs-you' })).toBe('Needs you');
    expect(sublineText({ kind: 'waiting', count: 2 })).toBe('2 waiting for connection');
    expect(sublineText({ kind: 'queued', count: 2 })).toBe('Queued · 2');
    expect(sublineText({ kind: 'switching' })).toBe('Switching machine…');
    expect(sublineText({ kind: 'reconnecting' })).toBe('Reconnecting…');
    expect(sublineText({ kind: 'failed' })).toBe('Last reply failed');
    expect(sublineText({ kind: 'lead', text: 'From Discord' })).toBe('From Discord');
  });
});

describe('queuedCount', () => {
  it('counts only person messages waiting behind a running reply', () => {
    expect(
      queuedCount([
        { role: 'person', state: 'queued' },
        { role: 'person', state: 'delivered' },
        { role: 'responder', state: 'queued' },
        { role: 'person', state: 'queued' },
      ]),
    ).toBe(2);
  });
});

describe('lastReplyFailed', () => {
  it('looks only at the newest reply', () => {
    expect(
      lastReplyFailed([
        { role: 'responder', state: 'failed', created_at: '2026-01-01T10:00:00Z' },
        { role: 'responder', state: 'answered', created_at: '2026-01-01T11:00:00Z' },
      ]),
    ).toBe(false);
    expect(
      lastReplyFailed([
        { role: 'responder', state: 'answered', created_at: '2026-01-01T10:00:00Z' },
        { role: 'responder', state: 'failed', created_at: '2026-01-01T11:00:00Z' },
        { role: 'person', state: 'answered', created_at: '2026-01-01T12:00:00Z' },
      ]),
    ).toBe(true);
    expect(lastReplyFailed([])).toBe(false);
  });
});
