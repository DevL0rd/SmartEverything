import { MenuRows, Stage } from 'smarteverything-kit';

const item = (label: string, icon: 'customize' | 'home' | 'close' | 'grid', extra = {}) => ({
  kind: 'item' as const,
  item: { label, icon, onPress: () => undefined, ...extra },
});
const entries = [
  item('Rename', 'customize'),
  item('Move to room', 'home', { description: 'Living room' }),
  item('Copy device ID', 'grid', { shortcut: 'Ctrl+C' }),
  { kind: 'divider' as const, key: 'd' },
  item('Remove device', 'close', { destructive: true }),
];
const box = {
  width: 260,
  borderRadius: 12,
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-outline-variant)',
  padding: '4px 0',
};
export const Popover = () => (
  <Stage theme="dark" width={320}>
    <div style={box}>
      <MenuRows entries={entries} close={() => undefined} layout="popover" />
    </div>
  </Stage>
);
export const Sheet = () => (
  <Stage theme="dark" width={360}>
    <div style={{ ...box, width: 340 }}>
      <MenuRows entries={entries} close={() => undefined} layout="sheet" />
    </div>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={320}>
    <div style={box}>
      <MenuRows entries={entries} close={() => undefined} layout="popover" />
    </div>
  </Stage>
);
