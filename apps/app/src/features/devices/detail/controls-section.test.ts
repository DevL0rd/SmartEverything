import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import type * as GridModule from '../../../components/grid';
import type { GridProps } from '../../../components/grid';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';
import type { CapabilityRow } from '../controls/capability-row';
import { ControlsSection } from './controls-section';

const pane = vi.hoisted(() => ({ width: 0 }));

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
      createElement(Grid, { ...props, measuredWidth: pane.width }),
  };
});
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/list-row', () => ({
  ListRow: ({ title }: { readonly title: string }): ReactNode => title,
}));
vi.mock('../../../components/section', () => ({
  List: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): 'pointer' => 'pointer' }));
vi.mock('../../../design/theme', () => ({ useThemeSetting: (): 'comfortable' => 'comfortable' }));
vi.mock('../controls/capability-row', () => ({
  CapabilityRow: ({ presented }: Parameters<typeof CapabilityRow>[0]): ReactNode =>
    createElement('div', { 'data-control': presented.key }),
}));
vi.mock('../controls/family-controls', () => ({ FAMILY_CONTROLS: {} }));
vi.mock('../controls/guard', () => ({ offlineReason: (): string => 'Offline' }));
vi.mock('../controls/primary-controls', () => ({ usePrimaryControls: (): [] => [] }));
vi.mock('../model/display-name', () => ({ useDisplayName: (): string => 'Fixture plug' }));

function control(key: DeviceCapability['key'], value: DeviceCapability['value']): DeviceCapability {
  return { key, label: key, access: 'read_write', value };
}

function plug(): Device {
  const toggle = { kind: 'boolean' } as const;
  return deviceFixture(0, {
    capabilities: [
      control('brightness', { kind: 'number', min: 0, max: 100, step: 1 }),
      control('mute', toggle),
      control('raw:fixture.extra', toggle),
    ],
  });
}

describe('Device control groups', () => {
  it.each([
    [380, 3],
    [2512, 1],
  ])('packs the two control groups and provider extras at %s px', (width, rows) => {
    pane.width = width;
    const screen = renderToStaticMarkup(
      createElement(ControlsSection, { device: plug(), beside: false }),
    );
    expect(screen.match(/class="flex-row items-stretch gap-grid-gap"/gu)).toHaveLength(rows);
    expect(screen).toContain('data-control="brightness"');
    expect(screen).toContain('data-control="mute"');
    expect(screen).toContain('Show provider extras');
    expect(screen).not.toContain('data-control="raw:fixture.extra"');
  });
});
