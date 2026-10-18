import { ListRow, Stage, SwipeRow } from 'smarteverything-kit';

const body = (
  <SwipeRow
    leading={{ label: 'Pin', icon: 'sparkles', tone: 'primary', onCommit: () => undefined }}
    trailing={{ label: 'Remove', icon: 'close', tone: 'critical', onCommit: () => undefined }}
    surface="bg"
  >
    <ListRow title="Evening lights" subtitle="Swipe left to remove, right to pin" icon="lamp" />
  </SwipeRow>
);
export const Resting = () => (
  <Stage theme="dark" width={440}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={440}>
    {body}
  </Stage>
);
