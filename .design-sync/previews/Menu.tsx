import { GlobalTheme, Menu, Stage, Text } from 'smarteverything-kit';

const items = [
  { label: 'Rename', icon: 'customize' as const, onPress: () => undefined },
  {
    label: 'Move to room',
    icon: 'home' as const,
    description: 'Living room',
    onPress: () => undefined,
  },
  { label: 'Copy device ID', icon: 'grid' as const, shortcut: 'Ctrl+C', onPress: () => undefined },
  { label: 'Remove device', icon: 'close' as const, destructive: true, onPress: () => undefined },
];
const anchor = { x: 280, y: 80, width: 40, height: 40 };
export const Dark = () => (
  <Stage theme="dark">
    <Text>Living room lamp</Text>
    <Menu
      label="Device menu"
      items={items}
      options={{}}
      anchor={anchor}
      onClose={() => undefined}
    />
  </Stage>
);
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">
      <Text>Living room lamp</Text>
      <Menu
        label="Device menu"
        items={items}
        options={{}}
        anchor={anchor}
        onClose={() => undefined}
      />
    </Stage>
  </GlobalTheme>
);
