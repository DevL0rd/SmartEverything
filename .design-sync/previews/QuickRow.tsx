import { QuickRow, Stage } from 'smarteverything-kit';

const items = [
  { label: 'Pin', icon: 'sparkles' as const, onPress: () => undefined },
  { label: 'Share', icon: 'upload' as const, onPress: () => undefined },
  { label: 'Copy', icon: 'grid' as const, onPress: () => undefined },
];
export const Actions = () => (
  <Stage theme="dark" width={360}>
    <QuickRow items={items} close={() => undefined} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={360}>
    <QuickRow items={items} close={() => undefined} />
  </Stage>
);
