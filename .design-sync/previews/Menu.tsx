import type { ReactElement } from 'react';
import { GlobalTheme, Menu, Stage, Text } from 'smarteverything-kit';

const items = [
  { label: 'Rename', icon: 'customize' as const, onPress: (): void => undefined },
  {
    label: 'Move to room',
    icon: 'home' as const,
    description: 'Living room',
    onPress: (): void => undefined,
  },
  {
    label: 'Copy device ID',
    icon: 'grid' as const,
    shortcut: 'Ctrl+C',
    onPress: (): void => undefined,
  },
  {
    label: 'Remove device',
    icon: 'close' as const,
    destructive: true,
    onPress: (): void => undefined,
  },
];
const anchor = { x: 280, y: 80, width: 40, height: 40 };
export const Dark = (): ReactElement => (
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
export const Light = (): ReactElement => (
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
