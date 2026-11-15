import { createContext, createElement, useContext, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as GridModule from '../../../components/grid';
import type { GridProps } from '../../../components/grid';
import type { StandardShellProps } from '../../../components/page-shell/shell-types';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';
import { SuppliesScreen } from './supplies-screen';

const fixture = vi.hoisted(() => ({ width: 0, devices: new Array<Device>() }));
const PaneWidth = createContext(0);
const paneLimit = { reading: 720, detail: 1120, full: Infinity, dashboard: 1440 } as const;

function none(): null {
  return null;
}

vi.mock('react-native', () => ({
  View: ({
    children,
    className,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
  }): ReactNode => createElement('div', { className }, children),
}));
vi.mock('../../../components/grid', async (importOriginal) => {
  const { Grid } = await importOriginal<typeof GridModule>();
  return {
    Grid: (props: GridProps): ReactNode =>
      createElement(Grid, { ...props, measuredWidth: useContext(PaneWidth) }),
  };
});
vi.mock('../../../components/page-shell/page-shell', () => ({
  PageShell: ({ width, children }: StandardShellProps): ReactNode =>
    createElement(
      PaneWidth.Provider,
      { value: Math.min(fixture.width, paneLimit[width ?? 'dashboard']) },
      children,
    ),
}));
vi.mock('../../../components/button', () => ({ Button: none }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: none }));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): 'pointer' => 'pointer' }));
vi.mock('../../../design/theme', () => ({ useThemeSetting: (): 'comfortable' => 'comfortable' }));
vi.mock('../../devices', () => ({
  MaintenanceCard: ({ device }: { readonly device: Device }): ReactNode =>
    createElement('div', { 'data-maintenance': device.id }),
}));
vi.mock('../model/climate-devices', () => ({
  useClimateSources: (): readonly { readonly model: { readonly device: Device } }[] =>
    fixture.devices.map((device) => ({ model: { device } })),
}));
vi.mock('../model/supplies', () => ({ hasSupplies: (): boolean => true }));

describe('Filters & water layout', () => {
  it.each([
    [380, 3],
    [1100, 2],
    [3096, 1],
  ])('packs three maintenance cards at pane width %s in %s rows', (width, rows) => {
    fixture.width = width;
    fixture.devices = [deviceFixture(0), deviceFixture(1), deviceFixture(2)];

    const page = renderToStaticMarkup(createElement(SuppliesScreen));

    expect(page.match(/class="flex-row items-stretch gap-grid-gap"/gu)).toHaveLength(rows);
    for (const device of fixture.devices) {
      expect(page).toContain(device.label);
      expect(page).toContain(`data-maintenance="${device.id}"`);
    }
  });
});
