import { describe, expect, it } from 'vitest';
import type { StackHandle } from './stack-handles';
import {
  CHAT_ROUTE,
  nextChatLeaf,
  nextColdTab,
  nextStep,
  type ChatLeafSource,
} from './tab-prewarm';

const routes = ['home', 'devices', 'cameras', 'fitness'].map((name) => ({
  key: `${name}-k`,
  name,
}));

describe('the tab prewarmer', () => {
  it('mounts the first tab in order that is neither shown nor awake', () => {
    const tab = nextColdTab(
      { index: 0, routes, preloadedRouteKeys: [] },
      (key) => key === 'devices-k',
    );
    expect(tab).toEqual({ key: 'cameras-k', name: 'cameras', mounted: false });
  });

  it('wakes a tab whose hidden render is already mounted', () => {
    const tab = nextColdTab({ index: 1, routes, preloadedRouteKeys: ['home-k'] }, () => false);
    expect(tab).toEqual({ key: 'home-k', name: 'home', mounted: true });
  });

  it('skips the settings tab, which mounts fresh on every visit', () => {
    const settings = [...routes, { key: 'settings-k', name: '(settings)' }];
    const tab = nextColdTab(
      { index: 0, routes: settings, preloadedRouteKeys: [] },
      (key) => key !== 'settings-k',
    );
    expect(tab).toBeNull();
  });

  it('stops when every other tab is awake', () => {
    expect(nextColdTab({ index: 2, routes, preloadedRouteKeys: [] }, () => true)).toBeNull();
  });

  it('mounts tabs in the order the person put them in', () => {
    const state = { index: 0, routes, preloadedRouteKeys: [] };
    const order = ['home', 'fitness', 'devices', 'cameras'];
    expect(nextColdTab(state, () => false, order)).toEqual({
      key: 'fitness-k',
      name: 'fitness',
      mounted: false,
    });
    expect(nextColdTab(state, (key) => key === 'fitness-k', order)?.name).toBe('devices');
  });

  it('never prewarms a tab that is left out of the order, such as a hidden section', () => {
    const state = { index: 0, routes, preloadedRouteKeys: [] };
    const order = ['home', 'devices'];
    expect(nextColdTab(state, () => false, order)?.name).toBe('devices');
    expect(nextColdTab(state, (key) => key === 'devices-k', order)).toBeNull();
  });

  it('does not prewarm the tab on screen even when the order lists it first', () => {
    const state = { index: 1, routes, preloadedRouteKeys: [] };
    expect(nextColdTab(state, () => false, ['devices', 'home'])?.name).toBe('home');
  });

  it('keeps the chat leaf stage after the last tab of the person order', () => {
    const chatState = {
      index: 0,
      preloadedRouteKeys: [],
      routes: [
        { key: 'home-k', name: 'home' },
        { key: 'ai-k', name: '(z-assistant)' },
      ],
    };
    const stack: StackHandle = {
      key: 'stack-1',
      routeNames: () => ['assistant/index'],
      preload: () => undefined,
    };
    const source: ChatLeafSource = { chatId: 'c1', preloaded: new Set(), stack };
    const order = ['(z-assistant)', 'home'];
    expect(nextStep(chatState, () => false, source, order)?.kind).toBe('tab');
    expect(nextStep(chatState, () => true, source, order)?.kind).toBe('chat');
  });
});

describe('the chat leaf prewarm', () => {
  const state = {
    index: 0,
    preloadedRouteKeys: [],
    routes: [
      { key: 'home-k', name: 'home' },
      { key: 'ai-k', name: '(z-assistant)' },
    ],
  };
  const stackOf = (routeNames: readonly string[]): StackHandle => ({
    key: 'stack-1',
    routeNames: () => routeNames,
    preload: () => undefined,
  });
  const awake = (): boolean => true;
  const source = (
    stack: StackHandle | null,
    chatId: string | null = 'c1',
    preloaded: readonly string[] = [],
  ): ChatLeafSource => ({ chatId, preloaded: new Set(preloaded), stack });

  it('targets the stack of the awake AI tab once', () => {
    const stack = stackOf(['assistant/index']);
    expect(nextChatLeaf(state, awake, source(stack))).toEqual({ stack, chatId: 'c1' });
    expect(nextChatLeaf(state, awake, source(stack, 'c1', ['stack-1:c1']))).toBeNull();
  });

  it('waits for the AI tab to be awake and for its stack to report in', () => {
    const stack = stackOf(['assistant/index']);
    expect(nextChatLeaf(state, () => false, source(stack))).toBeNull();
    expect(nextChatLeaf(state, awake, source(null))).toBeNull();
  });

  it('does nothing without a chat to reopen, with the chat open, or on the AI tab', () => {
    const stack = stackOf(['assistant/index']);
    expect(nextChatLeaf(state, awake, source(stack, null))).toBeNull();
    expect(nextChatLeaf(state, awake, source(stackOf(['assistant/index', CHAT_ROUTE])))).toBeNull();
    expect(nextChatLeaf({ ...state, index: 1 }, awake, source(stack))).toBeNull();
  });

  it('runs after every tab is awake', () => {
    const stack = stackOf(['assistant/index']);
    expect(nextStep(state, (key) => key === 'home-k', source(stack))).toEqual({
      kind: 'tab',
      key: 'ai-k',
      name: '(z-assistant)',
      mounted: false,
    });
    expect(nextStep(state, awake, source(stack))).toEqual({
      kind: 'chat',
      stack,
      chatId: 'c1',
    });
  });
});
