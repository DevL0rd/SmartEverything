import { ApiError } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANSWER_TIMEOUT_MS, PendingAnswers } from '../../src/local/pending-answers';

let answers: PendingAnswers<string>;

beforeEach(() => {
  vi.useFakeTimers();
  answers = new PendingAnswers<string>('request');
});

afterEach(() => {
  vi.useRealTimers();
});

function ask(requestId: string, clients: readonly string[] = ['phone-1']): Promise<string> {
  return answers.wait({
    requestId,
    clients,
    timeoutMs: ANSWER_TIMEOUT_MS,
    unanswered: () => 'unanswered',
  });
}

describe('PendingAnswers', () => {
  it('waits the answer window the push action allows', () => {
    expect(ANSWER_TIMEOUT_MS).toBe(25_000);
  });

  it('resolves a request with the answer of a phone that was asked', async () => {
    const waiting = ask('r1', ['phone-1', 'phone-2']);
    answers.answer('phone-2', 'r1', 'yes');
    await expect(waiting).resolves.toBe('yes');
  });

  it('cancels the timeout once answered, so the late timer cannot resolve it again', async () => {
    const waiting = ask('r1');
    answers.answer('phone-1', 'r1', 'yes');
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS * 2);
    await expect(waiting).resolves.toBe('yes');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves with the unanswered result after the timeout and forgets the request', async () => {
    const waiting = ask('r1');
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS);
    await expect(waiting).resolves.toBe('unanswered');
    expect(() => {
      answers.answer('phone-1', 'r1', 'late');
    }).toThrow(new ApiError('not_found', 'This request already finished or was never sent.'));
  });

  it('refuses an answer from a phone that was not asked and keeps waiting', async () => {
    const waiting = ask('r1');
    expect(() => {
      answers.answer('stranger', 'r1', 'yes');
    }).toThrow(new ApiError('forbidden', 'This phone was not asked to do that.'));
    answers.answer('phone-1', 'r1', 'ok');
    await expect(waiting).resolves.toBe('ok');
  });

  it('refuses an answer to a request that was never sent', () => {
    expect(() => {
      answers.answer('phone-1', 'nope', 'yes');
    }).toThrow(new ApiError('not_found', 'This request already finished or was never sent.'));
  });

  it('refuses a second answer to the same request', async () => {
    const waiting = ask('r1');
    answers.answer('phone-1', 'r1', 'first');
    expect(() => {
      answers.answer('phone-1', 'r1', 'second');
    }).toThrow(ApiError);
    await expect(waiting).resolves.toBe('first');
  });

  it('keeps requests apart', async () => {
    const first = ask('r1');
    const second = ask('r2');
    answers.answer('phone-1', 'r2', 'b');
    answers.answer('phone-1', 'r1', 'a');
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
  });

  it('stop resolves every waiting request with the given result and clears the timers', async () => {
    const first = ask('r1');
    const second = ask('r2');
    answers.stop('stopped');
    await expect(Promise.all([first, second])).resolves.toEqual(['stopped', 'stopped']);
    expect(vi.getTimerCount()).toBe(0);
  });
});
