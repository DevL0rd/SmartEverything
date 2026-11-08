import type { ReactElement } from 'react';
import { PrimaryAction, Stage } from 'smarteverything-kit';

export const Default = (): ReactElement => (
  <Stage theme="dark" width={320}>
    <PrimaryAction label="Add automation" icon="plus" onPress={() => undefined} />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={320}>
    <PrimaryAction label="Add automation" icon="plus" onPress={() => undefined} />
  </Stage>
);
