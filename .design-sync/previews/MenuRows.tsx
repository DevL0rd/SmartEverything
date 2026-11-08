import type { ComponentProps, ReactNode } from 'react';
import { MenuRows, Stage } from 'smarteverything-kit';

type Entry = ComponentProps<typeof MenuRows>['entries'][number];
type Item = Extract<Entry, { kind: 'item' }>['item'];

const close = (): void => undefined;
const item = (
  label: string,
  icon: NonNullable<Item['icon']>,
  extra: Partial<Item> = {},
): Entry => ({
  kind: 'item',
  item: { label, icon, onPress: close, ...extra },
});
const entries: readonly Entry[] = [
  item('Rename', 'customize'),
  item('Move to room', 'home', { description: 'Living room' }),
  item('Copy device ID', 'grid', { shortcut: 'Ctrl+C' }),
  { kind: 'divider', key: 'd' },
  item('Remove device', 'close', { destructive: true }),
];
const box = {
  width: 260,
  borderRadius: 12,
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-outline-variant)',
  padding: '4px 0',
};
export const Popover = (): ReactNode => (
  <Stage theme="dark" width={320}>
    <div style={box}>
      <MenuRows entries={entries} close={close} layout="popover" />
    </div>
  </Stage>
);
export const Sheet = (): ReactNode => (
  <Stage theme="dark" width={360}>
    <div style={{ ...box, width: 340 }}>
      <MenuRows entries={entries} close={close} layout="compact" />
    </div>
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={320}>
    <div style={box}>
      <MenuRows entries={entries} close={close} layout="popover" />
    </div>
  </Stage>
);
