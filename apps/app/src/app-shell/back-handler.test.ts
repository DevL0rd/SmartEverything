import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ BackHandler: { addEventListener: vi.fn() } }));
vi.mock('../design/platform', () => ({ isNative: (): boolean => true }));
vi.mock('./nav-sheet-state', () => ({ navSheetPhase: { get: (): string => 'closed' } }));

const { atStackRoot } = await import('./back-handler');

const leaf = { routes: [{}] };

describe('the tab root check for the back button', () => {
  it('is at the root when every stack shows its first screen', () => {
    expect(atStackRoot({ index: 0, routes: [{ state: leaf }] })).toBe(true);
  });

  it('is not at the root when a nested stack has a screen pushed', () => {
    const settings = { index: 1, routes: [{}, {}] };
    expect(atStackRoot({ index: 0, routes: [{ state: settings }] })).toBe(false);
  });

  it('is not at the root when a nested section switcher shows a later section', () => {
    const sections = { index: 2, routes: [{}, {}, { state: leaf }] };
    expect(atStackRoot({ index: 0, routes: [{ state: sections }] })).toBe(false);
  });

  it('is at the root on the first section of a nested section switcher', () => {
    const sections = { index: 0, routes: [{ state: leaf }, {}] };
    expect(atStackRoot({ index: 0, routes: [{ state: sections }] })).toBe(true);
  });

  it('is at the root when there is no nested state yet', () => {
    expect(atStackRoot(undefined)).toBe(true);
  });
});
