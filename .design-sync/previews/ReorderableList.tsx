import { ListRow, ReorderableList, Stage } from 'smarteverything-kit';

const items = [
  { id: 'lamp', name: 'Living room lamp' },
  { id: 'tv', name: 'Television' },
  { id: 'blinds', name: 'Bedroom blinds' },
  { id: 'fan', name: 'Office fan' },
];
const list = (
  <ReorderableList
    items={items}
    keyOf={(i) => i.id}
    labelOf={(i) => i.name}
    renderItem={(i) => <ListRow title={i.name} subtitle="Drag to reorder" icon="grip" />}
    onReorder={() => undefined}
  />
);
export const Devices = () => (
  <Stage theme="dark" width={440}>
    {list}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={440}>
    {list}
  </Stage>
);
