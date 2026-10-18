import { describe, expect, it } from 'vitest';
import {
  StackRouter,
  TabRouter,
  type NavigationAction,
  type ParamListBase,
  type StackNavigationState,
} from '../../../../node_modules/expo-router/build/react-navigation/routers';
import { FITNESS_SECTION_ROUTES } from '../features/fitness/model/section-routes';
import { reduce } from './router-kit.test-util';
import { popTabToRoot } from './tab-router';

const SECTIONS = 'fitness/(sections)';
const METRIC = 'fitness/metric/[metric]';

const tabs = TabRouter({ backBehavior: 'initialRoute', initialRouteName: 'index' });
const stack = StackRouter({ initialRouteName: SECTIONS });
const options = {
  routeNames: [SECTIONS, METRIC, 'fitness/browse'],
  routeParamList: {},
  routeGetIdList: { [SECTIONS]: (): string => SECTIONS },
};

function stackOverSections(): StackNavigationState<ParamListBase> {
  const base = stack.getInitialState(options);
  const nested = tabs.getInitialState({
    routeNames: [...FITNESS_SECTION_ROUTES],
    routeParamList: {},
    routeGetIdList: {},
  });
  const sections = base.routes.map((route) =>
    route.name === SECTIONS ? { ...route, state: nested } : route,
  );
  return { ...base, routes: sections };
}

function apply(
  state: StackNavigationState<ParamListBase>,
  action: NavigationAction,
): StackNavigationState<ParamListBase> {
  const next = reduce(stack, state, action, options);
  if (next === null) return state;
  return next.stale === false ? next : stack.getRehydratedState(next, options);
}

function onMetric(): StackNavigationState<ParamListBase> {
  return apply(stackOverSections(), {
    type: 'PUSH',
    payload: { name: METRIC, params: { metric: 'steps' } },
  });
}

const names = (state: StackNavigationState<ParamListBase>): string[] =>
  state.routes.map((route) => route.name);

describe('a section link from a page pushed on the Fitness stack', () => {
  it('reuses the existing section navigator instead of adding a second one', () => {
    const before = onMetric();
    const sectionsKey = before.routes.find((route) => route.name === SECTIONS)?.key;
    let state = before;
    for (let hop = 0; hop < 5; hop += 1) {
      state = apply(state, {
        type: 'PUSH',
        payload: { name: SECTIONS, params: { screen: 'heart', params: { day: '2026-10-01' } } },
      });
      state = apply(state, { type: 'PUSH', payload: { name: METRIC, params: { metric: 'hr' } } });
    }
    expect(names(state).filter((name) => name === SECTIONS)).toHaveLength(1);
    expect(state.routes.find((route) => route.name === SECTIONS)?.key).toBe(sectionsKey);
  });

  it('carries the section and day to the existing navigator and goes back to the page', () => {
    const state = apply(onMetric(), {
      type: 'PUSH',
      payload: { name: SECTIONS, params: { screen: 'nutrition', params: { day: '2026-10-01' } } },
    });
    const top = state.routes[state.index];
    expect(top?.name).toBe(SECTIONS);
    expect(top?.params).toEqual({ screen: 'nutrition', params: { day: '2026-10-01' } });
    const back = apply(state, { type: 'GO_BACK' });
    expect(names(back)).toEqual([METRIC]);
  });

  it('is returned to the first section by pressing the Fitness tab again', () => {
    const shown = apply(onMetric(), {
      type: 'PUSH',
      payload: { name: SECTIONS, params: { screen: 'heart' } },
    });
    const sectionsKey = shown.routes.find((route) => route.name === SECTIONS)?.key;
    const sent: NavigationAction[] = [];
    popTabToRoot({ state: shown }, (action) => {
      sent.push(action);
    });
    const reset = sent.reduce(apply, shown);
    expect(names(reset)).toEqual([SECTIONS]);
    expect(reset.routes[0]?.key).toBe(sectionsKey);
  });
});
