import { describe, expect, it } from 'vitest';
import {
  TabRouter,
  type NavigationAction,
  type ParamListBase,
  type TabNavigationState,
} from '../../../../../../node_modules/expo-router/build/react-navigation/routers';
import { reduce } from '../../../app-shell/router-kit.test-util';
import { FITNESS_SECTION_ROUTES } from '../model/section-routes';
import { openSection, type SectionRouter } from './open-section';

const router = TabRouter({ backBehavior: 'initialRoute', initialRouteName: 'index' });
const options = {
  routeNames: [...FITNESS_SECTION_ROUTES],
  routeParamList: {},
  routeGetIdList: {},
};

function sectionsOnToday(): TabNavigationState<ParamListBase> {
  return router.getInitialState(options);
}

function navigationOver(initial: TabNavigationState<ParamListBase>): {
  readonly navigation: Parameters<typeof openSection>[0]['navigation'];
  readonly current: () => TabNavigationState<ParamListBase>;
} {
  let state = initial;
  return {
    navigation: {
      getState: (): TabNavigationState<ParamListBase> => state,
      dispatch: (action: NavigationAction): void => {
        const next = reduce(router, state, action, options);
        state = next === null ? state : router.getRehydratedState(next, options);
      },
    },
    current: () => state,
  };
}

function recordingRouter(): { readonly router: SectionRouter; readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    router: {
      push: () => calls.push('push'),
      replace: () => calls.push('replace'),
      dismissTo: () => calls.push('dismissTo'),
    },
  };
}

const nameOf = (state: TabNavigationState<ParamListBase>): string | undefined =>
  state.routes[state.index]?.name;

describe('opening a fitness section', () => {
  it('jumps inside the section switcher without adding or removing a route', () => {
    const initial = sectionsOnToday();
    const { navigation, current } = navigationOver(initial);
    const { router: stack, calls } = recordingRouter();
    openSection({ tab: 'heart', active: 'today', navigation, router: stack });
    openSection({ tab: 'workouts', active: 'heart', navigation, router: stack });
    expect(nameOf(current())).toBe('workouts/index');
    expect(current().routes.map((route) => route.key)).toEqual(
      initial.routes.map((route) => route.key),
    );
    openSection({ tab: 'today', active: 'workouts', navigation, router: stack });
    expect(nameOf(current())).toBe('index');
    expect(calls).toEqual([]);
  });

  it('does nothing for the section already shown', () => {
    const { navigation, current } = navigationOver(sectionsOnToday());
    const { router: stack, calls } = recordingRouter();
    openSection({ tab: 'today', active: 'today', navigation, router: stack });
    expect(nameOf(current())).toBe('index');
    expect(calls).toEqual([]);
  });

  it('pushes, replaces and dismisses on a stack, as inside the assistant', () => {
    const { router: stack, calls } = recordingRouter();
    const navigation = {
      getState: (): { type: string; key: string } => ({ type: 'stack', key: 's' }),
      dispatch: (): void => undefined,
    };
    openSection({ tab: 'sleep', active: 'today', navigation, router: stack });
    openSection({ tab: 'body', active: 'sleep', navigation, router: stack });
    openSection({ tab: 'today', active: 'body', navigation, router: stack });
    expect(calls).toEqual(['push', 'replace', 'dismissTo']);
  });
});
