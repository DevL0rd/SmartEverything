import { describe, expect, it, vi } from 'vitest';
import type { NavigationAction, NavigationState } from 'expo-router/react-navigation';

vi.mock('expo-crypto', () => ({ randomUUID: (): string => 'request' }));

const {
  REPLACEMENT_REQUEST,
  replacementFor,
  replacementOf,
  requestIn,
  sourceIsCurrent,
  stateIn,
  tabIsCurrent,
} = await import('./tab-replacement');

function stack(index: number): NavigationState {
  return {
    key: 'cameras-stack',
    index,
    routeNames: ['index', 'detail'],
    routes: [
      { key: 'index-1', name: 'index' },
      { key: 'detail-1', name: 'detail' },
    ],
    type: 'stack',
    stale: false,
  };
}

function tabs(stackIndex: number, current = 0): NavigationState {
  return {
    key: 'tabs',
    index: current,
    routeNames: ['(cameras)', '(home)'],
    routes: [
      { key: '(cameras)-1', name: '(cameras)', state: stack(stackIndex) },
      { key: '(home)-1', name: '(home)' },
    ],
    type: 'tab',
    stale: false,
  };
}

const replace: NavigationAction = { type: 'REPLACE', payload: { name: '(home)' } };

describe('replacing a tab that has pushed screens', () => {
  it('records the tab, the stack and the screen being left', () => {
    expect(replacementFor(tabs(1), replace)).toEqual({
      id: 'request',
      phase: 'requested',
      sourceTabKey: '(cameras)-1',
      sourceStateKey: 'cameras-stack',
      sourceRouteKey: 'detail-1',
      destination: { type: 'JUMP_TO', target: 'tabs', payload: { name: '(home)' } },
    });
  });

  it('is nothing when the tab only shows its first screen', () => {
    expect(replacementFor(tabs(0), replace)).toBeNull();
  });

  it('is nothing for an action without a destination', () => {
    expect(replacementFor(tabs(1), { type: 'REPLACE' })).toBeNull();
  });
});

describe('reading a stored request', () => {
  it('accepts a well formed request and rejects the rest', () => {
    const request = replacementFor(tabs(1), replace);
    expect(replacementOf(request)).toEqual(request);
    expect(replacementOf({ id: 1 })).toBeNull();
    expect(replacementOf(undefined)).toBeNull();
  });

  it('finds a request stored on a nested state', () => {
    const request = replacementFor(tabs(1), replace);
    const state = Object.assign(tabs(1), { [REPLACEMENT_REQUEST]: request });
    expect(requestIn({ ...tabs(0), routes: [{ key: 'a', name: 'a', state }] })).toEqual(request);
    expect(requestIn(tabs(1))).toBeNull();
  });
});

describe('checking the request is still current', () => {
  it('finds a state by key and ignores stale ones', () => {
    expect(stateIn(tabs(1), 'cameras-stack')?.index).toBe(1);
    expect(stateIn(tabs(1), 'missing')).toBeNull();
    expect(stateIn({ key: 'tabs', stale: true, routes: [] }, 'tabs')).toBeNull();
  });

  it('is current while the source tab and screen are on top', () => {
    const request = replacementFor(tabs(1), replace);
    if (request === null) throw new Error('no request');
    expect(tabIsCurrent(tabs(1), request)).toBe(true);
    expect(sourceIsCurrent(tabs(1), request)).toBe(true);
  });

  it('is stale once the user moved to another tab or screen', () => {
    const request = replacementFor(tabs(1), replace);
    if (request === null) throw new Error('no request');
    expect(tabIsCurrent(tabs(1, 1), request)).toBe(false);
    expect(sourceIsCurrent(tabs(0), request)).toBe(false);
  });
});
