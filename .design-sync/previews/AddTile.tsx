import { AddTile, Stage } from 'smarteverything-kit';

const body = (
  <div style={{ width: 220, height: 150, display: 'flex', flexDirection: 'column' }}>
    <AddTile onPress={() => undefined} />
  </div>
);
export const Tile = () => (
  <Stage theme="dark" width={260}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={260}>
    {body}
  </Stage>
);
