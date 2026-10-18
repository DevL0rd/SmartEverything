import { PrimaryAction, Stage } from 'smarteverything-kit';

export const Default = () => (
  <Stage theme="dark" width={320}>
    <PrimaryAction label="Add automation" icon="plus" onPress={() => undefined} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={320}>
    <PrimaryAction label="Add automation" icon="plus" onPress={() => undefined} />
  </Stage>
);
