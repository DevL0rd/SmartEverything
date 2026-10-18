import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { cellNodes as nodes, PALETTE, PaletteContext } from './cell-mocks';
import { useCellEnvironment } from './cell-budget';
import { useColour, useColourResolver } from '../../design/colour';

function mountedHooks(read: () => unknown): number {
  const container = {
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  };
  const root = createRoot(container);
  nodes.hooks = {};
  const Probe = (): ReactNode => {
    read();
    return null;
  };
  act(() => {
    root.render(createElement(PaletteContext, { value: PALETTE }, createElement(Probe)));
  });
  const used = nodes.hooks['use'] ?? 0;
  act(() => {
    root.unmount();
  });
  return used;
}

describe('colour resolver hooks', () => {
  useCellEnvironment();

  it('reads the palette once however many colours a resolver is asked for', () => {
    const roles = ['surface-3', 'surface-2', 'outline', 'scrim'] as const;
    expect(
      mountedHooks(() => {
        const colour = useColourResolver();
        return roles.map(colour);
      }),
    ).toBe(1);
  });

  it('reads the palette once for a single colour', () => {
    expect(mountedHooks(() => useColour('outline'))).toBe(1);
  });

  it('resolves each role to the palette colour', () => {
    let resolved: readonly string[] = [];
    mountedHooks(() => {
      const colour = useColourResolver();
      resolved = [colour('surface-3'), colour('on-surface')];
    });
    expect(resolved).toEqual([PALETTE['surface-3'], PALETTE['on-surface']]);
  });
});
