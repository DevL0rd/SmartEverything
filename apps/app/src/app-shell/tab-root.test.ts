import { describe, expect, it } from 'vitest';
import type { NavigationAction, NavigationState } from 'expo-router/react-navigation';
import { TabRouter } from '../../../../node_modules/expo-router/build/react-navigation/routers';
import { reduce } from './router-kit.test-util';
import { COMMIT_REPLACEMENT } from './tab-replacement';
import { anchorTabRoots, popTabToRoot, shellTabBackBehavior } from './tab-router';

function actionsFor(state: Parameters<typeof popTabToRoot>[0]['state']): NavigationAction[] {
  const sent: NavigationAction[] = [];
  popTabToRoot({ state }, (action) => {
    sent.push(action);
  });
  return sent;
}

interface Sections {
  key: string;
  type: string;
  index: number;
  routes: { key: string; name: string }[];
}

const sections = (index: number): Sections => ({
  key: 'sections-1',
  type: 'tab',
  index,
  routes: [
    { key: 'index-1', name: 'index' },
    { key: 'heart-1', name: 'heart' },
  ],
});

describe('pressing the shown tab again', () => {
  it('returns a section switcher to its first section', () => {
    const stack = {
      key: 'stack-1',
      type: 'stack',
      index: 0,
      routes: [{ key: 's', name: 'fitness/(sections)', state: sections(1) }],
    };
    expect(actionsFor(stack)).toEqual([
      { type: 'JUMP_TO', payload: { name: 'index' }, target: 'sections-1' },
    ]);
  });

  it('pops the stack and resets the section switcher under it', () => {
    const stack = {
      key: 'stack-1',
      type: 'stack',
      index: 1,
      routes: [
        { key: 's', name: 'fitness/(sections)', state: sections(1) },
        { key: 'm', name: 'fitness/metric/[metric]' },
      ],
    };
    expect(actionsFor(stack).map((action) => action.type)).toEqual(['POP_TO_TOP', 'JUMP_TO']);
  });

  it('does nothing when every level already shows its first screen', () => {
    const stack = {
      key: 'stack-1',
      type: 'stack',
      index: 0,
      routes: [{ key: 's', name: 'fitness/(sections)', state: sections(0) }],
    };
    expect(actionsFor(stack)).toEqual([]);
  });
});

const HISTORY_CONFIG = {
  routeNames: ['(home)', '(devices)', '(automations)'],
  routeParamList: {},
  routeGetIdList: {},
};
const ACTIVITY_STACK: NavigationState = {
  key: 'home-stack',
  type: 'stack',
  index: 1,
  routeNames: ['index', 'activity'],
  routes: [
    { key: 'home', name: 'index' },
    { key: 'activity', name: 'activity' },
  ],
  stale: false,
};

describe('cross-tab back history', () => {
  it.each([
    { native: false, history: 2, back: { name: '(home)', state: ACTIVITY_STACK } },
    { native: true, history: 1, back: null },
  ])('opens Automations with the native=$native back policy', ({ native, history, back }) => {
    const router = TabRouter({
      initialRouteName: '(home)',
      backBehavior: shellTabBackBehavior(native),
    });
    const initial = router.getInitialState(HISTORY_CONFIG);
    const activity = {
      ...initial,
      routes: initial.routes.map((route) =>
        route.name === '(home)' ? { ...route, state: ACTIVITY_STACK } : route,
      ),
    };
    const destination = router.getStateForAction(
      activity,
      { type: 'NAVIGATE', payload: { name: '(automations)' } },
      HISTORY_CONFIG,
    );
    if (destination === null) throw new Error('Automations did not open');
    const opened =
      destination.stale === false
        ? destination
        : router.getRehydratedState(destination, HISTORY_CONFIG);
    expect(opened.routes[opened.index]?.name).toBe('(automations)');
    expect(opened.history).toHaveLength(history);

    const returned = router.getStateForAction(opened, { type: 'GO_BACK' }, HISTORY_CONFIG);
    if (back === null) {
      expect(returned).toBeNull();
    } else {
      expect(returned?.routes[returned.index ?? 0]).toMatchObject(back);
    }
  });

  it.each(['REPLACE', COMMIT_REPLACEMENT])('retains older browser visits after %s', (type) => {
    const base = TabRouter({ backBehavior: shellTabBackBehavior(false) });
    const router = { ...base, ...anchorTabRoots(base) };
    const activity = router.getInitialState(HISTORY_CONFIG);
    const next = reduce(
      router,
      activity,
      { type: 'NAVIGATE', payload: { name: '(devices)' } },
      HISTORY_CONFIG,
    );
    if (next === null) throw new Error('Devices did not open');
    const devices = next.stale === false ? next : router.getRehydratedState(next, HISTORY_CONFIG);
    const replaced = reduce(
      router,
      devices,
      { type, payload: { name: '(automations)' } },
      HISTORY_CONFIG,
    );
    if (replaced === null) throw new Error('Automations did not replace Devices');
    const automations =
      replaced.stale === false ? replaced : router.getRehydratedState(replaced, HISTORY_CONFIG);
    expect(automations.routes[automations.index]?.name).toBe('(automations)');
    expect(automations.history).toHaveLength(devices.history.length);

    const returned = reduce(router, automations, { type: 'GO_BACK' }, HISTORY_CONFIG);
    expect(returned?.routes[returned.index ?? 0]?.name).toBe('(home)');
  });
});
