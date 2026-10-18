import { beforeEach, describe, expect, it, vi } from 'vitest';

const setParams = vi.fn();
const params = vi.hoisted(() => {
  const current: Record<string, unknown> = {};
  return { current };
});

vi.mock('expo-router', () => ({
  useRouter: (): { readonly setParams: typeof setParams } => ({ setParams }),
  useLocalSearchParams: (): Record<string, unknown> => params.current,
}));

const { sectionParamOf, useSectionParam } = await import('./use-section-param');

describe('sectionParamOf', () => {
  it('reads a present string param', () => {
    expect(sectionParamOf({ folder: 'photos' }, 'folder')).toBe('photos');
  });

  it('treats a missing, empty or repeated param as closed', () => {
    expect(sectionParamOf({}, 'folder')).toBeNull();
    expect(sectionParamOf({ folder: '' }, 'folder')).toBeNull();
    expect(sectionParamOf({ folder: ['a', 'b'] }, 'folder')).toBeNull();
  });
});

describe('useSectionParam', () => {
  beforeEach(() => {
    setParams.mockClear();
    params.current = {};
  });

  it('opens a section by writing its param', () => {
    const [value, set] = useSectionParam('folder');
    expect(value).toBeNull();
    set('photos');
    expect(setParams).toHaveBeenCalledWith({ folder: 'photos' });
  });

  it('clears a section by removing its param and reads the current one', () => {
    params.current = { folder: 'photos' };
    const [value, , clear] = useSectionParam('folder');
    expect(value).toBe('photos');
    clear();
    expect(setParams).toHaveBeenCalledWith({ folder: undefined });
  });
});
