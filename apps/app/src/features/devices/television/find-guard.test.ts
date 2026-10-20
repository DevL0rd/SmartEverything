import { describe, expect, it } from 'vitest';
import { findLine, mayFind, NEVER_TRIED, RETRY_AFTER_MS } from './find-guard';

const NOW = 1_000_000;

const OPEN = { linked: false, running: false, memory: NEVER_TRIED, now: NOW };

describe('when the television page asks the hub to find the television', () => {
  it('never asks when the television is linked', () => {
    expect(mayFind({ ...OPEN, linked: true })).toBe(false);
  });

  it('asks once when the page opens with an unlinked television', () => {
    expect(mayFind(OPEN)).toBe(true);
  });

  it('does not ask while a request is running', () => {
    expect(mayFind({ ...OPEN, running: true })).toBe(false);
  });

  it('does not ask again after a request that is still waiting for Allow', () => {
    expect(mayFind({ ...OPEN, memory: { attempted: true, failedAt: null } })).toBe(false);
  });

  it('does not ask again within a minute of a failure', () => {
    const memory = { attempted: true, failedAt: NOW - RETRY_AFTER_MS };
    expect(mayFind({ ...OPEN, memory })).toBe(false);
  });

  it('asks again once a minute has passed since a failure', () => {
    const memory = { attempted: true, failedAt: NOW - RETRY_AFTER_MS - 1 };
    expect(mayFind({ ...OPEN, memory })).toBe(true);
  });
});

describe('the status line while finding', () => {
  const base = {
    linked: false,
    running: false,
    reply: null,
    stage: { kind: 'form' } as const,
    tried: true,
  };

  it('says nothing for a television that was linked all along', () => {
    expect(findLine({ ...base, linked: true, tried: false })).toBeNull();
  });

  it('says it is looking while the request runs', () => {
    expect(findLine({ ...base, running: true })).toBe('Looking for your TV on the network');
  });

  it('asks for Allow once the hub started the link', () => {
    const reply = { outcome: 'asking', message: 'Allow on the TV to finish linking' } as const;
    expect(findLine({ ...base, reply })).toBe('Allow on the TV to finish linking');
  });

  it('says linked after the link finished', () => {
    expect(findLine({ ...base, linked: true })).toBe('Linked');
  });

  it('shows the hub message calmly when the television was not found', () => {
    const reply = { outcome: 'not_found', message: 'No Samsung screen answered.' } as const;
    expect(findLine({ ...base, reply })).toBe('No Samsung screen answered.');
  });
});
