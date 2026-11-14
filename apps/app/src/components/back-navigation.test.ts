import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const dismissTo = vi.hoisted(() => vi.fn());

vi.mock('expo-router', () => ({
  router: { dismissTo },
  useFocusEffect: vi.fn(),
  useNavigation: vi.fn(),
  usePathname: vi.fn(),
  useRoute: vi.fn(),
}));

const { leave } = await import('./back-navigation');

const opener = { key: 'photos-1', href: '/photos' } as const;
const callerStep = { kind: 'caller', opener, parent: '/settings/assistant' } as const;

function navigation(
  type: string,
  keys: readonly string[],
): {
  readonly getState: () => { readonly type: string; readonly routes: readonly { key: string }[] };
  readonly goBack: Mock<() => void>;
} {
  return {
    getState: () => ({ type, routes: keys.map((key) => ({ key })) }),
    goBack: vi.fn<() => void>(),
  };
}

function rules(live: boolean): { isLive: () => boolean; returned: Mock<() => void> } {
  return { isLive: () => live, returned: vi.fn<() => void>() };
}

describe('the back action', () => {
  beforeEach(() => {
    dismissTo.mockClear();
  });

  it('pops the stack when the opener is directly below', () => {
    const nav = navigation('stack', ['photos-1', 'page-2']);
    const r = rules(true);
    expect(leave(callerStep, nav, 'page-2', r)).toBe('opener');
    expect(nav.goBack).toHaveBeenCalledOnce();
    expect(dismissTo).not.toHaveBeenCalled();
    expect(r.returned).toHaveBeenCalledOnce();
  });

  it('navigates to the opener in another tab instead of popping what is below', () => {
    const nav = navigation('stack', ['settings-root', 'page-2']);
    const r = rules(true);
    expect(leave(callerStep, nav, 'page-2', r)).toBe('opener');
    expect(nav.goBack).not.toHaveBeenCalled();
    expect(dismissTo).toHaveBeenCalledWith('/photos');
  });

  it('navigates to the opener when the page is the first of its stack', () => {
    const nav = navigation('stack', ['page-2']);
    expect(leave(callerStep, nav, 'page-2', rules(true))).toBe('opener');
    expect(nav.goBack).not.toHaveBeenCalled();
    expect(dismissTo).toHaveBeenCalledWith('/photos');
  });

  it('never treats a neighbouring tab as the page below', () => {
    const nav = navigation('tab', ['photos-1', 'page-2']);
    expect(leave(callerStep, nav, 'page-2', rules(true))).toBe('opener');
    expect(nav.goBack).not.toHaveBeenCalled();
    expect(dismissTo).toHaveBeenCalledWith('/photos');
  });

  it('goes to the parent when the opener no longer exists', () => {
    const nav = navigation('stack', ['settings-root', 'page-2']);
    expect(leave(callerStep, nav, 'page-2', rules(false))).toBe('parent');
    expect(nav.goBack).not.toHaveBeenCalled();
    expect(dismissTo).toHaveBeenCalledWith('/settings/assistant');
  });

  it('goes to the parent for a parent step', () => {
    const nav = navigation('stack', ['photos-1', 'page-2']);
    const step = { kind: 'parent', parent: '/settings/assistant' } as const;
    expect(leave(step, nav, 'page-2', rules(true))).toBe('parent');
    expect(dismissTo).toHaveBeenCalledWith('/settings/assistant');
  });

  it('does nothing and does not mark a return when there is nowhere to go', () => {
    const nav = navigation('stack', ['page-2']);
    const r = rules(false);
    const step = { kind: 'caller', opener, parent: null } as const;
    expect(leave(step, nav, 'page-2', r)).toBeNull();
    expect(dismissTo).not.toHaveBeenCalled();
    expect(r.returned).not.toHaveBeenCalled();
  });
});
