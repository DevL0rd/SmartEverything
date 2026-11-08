import { describe, expect, it } from 'vitest';
import { hubAnswered, onHubAnswered } from './hub-answers';

describe('hearing that the hub answered', () => {
  it('tells every listener until it stops listening', () => {
    const heard: string[] = [];
    const stopFirst = onHubAnswered(() => heard.push('first'));
    const stopSecond = onHubAnswered(() => heard.push('second'));
    hubAnswered();
    stopFirst();
    hubAnswered();
    stopSecond();
    hubAnswered();
    expect(heard).toEqual(['first', 'second', 'second']);
  });

  it('lets a listener stop listening while it is being told', () => {
    const heard: string[] = [];
    const stop = onHubAnswered(() => {
      heard.push('once');
      stop();
    });
    hubAnswered();
    hubAnswered();
    expect(heard).toEqual(['once']);
  });
});
