import { vi } from 'vitest';

interface TestAction {
  readonly type: string;
  readonly payload?: object;
}

interface TestRoute {
  readonly key: string;
  readonly name: string;
  readonly params: object;
}

export const StackActions = {
  popToTop: (): TestAction => ({ type: 'POP_TO_TOP' }),
  push: (name: string, params?: object): TestAction => ({
    type: 'PUSH',
    payload: { name, params },
  }),
  replace: (name: string, params?: object): TestAction => ({
    type: 'REPLACE',
    payload: { name, params },
  }),
  pop: (count = 1): TestAction => ({ type: 'POP', payload: { count } }),
};

export const useRoute = (): TestRoute => ({ key: 'route', name: 'route', params: {} });
export const useNavigationState = (): undefined => undefined;
export const usePreventRemove = vi.fn();
