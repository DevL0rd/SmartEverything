import { Badge, HScroller, Stage } from 'smarteverything-kit';

const chips = [
  'All rooms',
  'Living room',
  'Bedroom',
  'Kitchen',
  'Office',
  'Garage',
  'Garden',
  'Bathroom',
  'Hallway',
].map((r) => (
  <div key={r} style={{ marginRight: 8 }}>
    <Badge label={r} tone="primary" />
  </div>
));
export const Scrolling = () => (
  <Stage theme="dark" width={360}>
    <HScroller label="Rooms">{chips}</HScroller>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={360}>
    <HScroller label="Rooms">{chips}</HScroller>
  </Stage>
);
