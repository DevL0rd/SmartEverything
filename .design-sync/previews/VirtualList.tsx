import { ListRow, Stage, VirtualList } from 'smarteverything-kit';

const sections = [
  {
    key: 'on',
    title: 'On',
    data: [
      { id: 'lamp', name: 'Living room lamp', sub: '65% brightness' },
      { id: 'tv', name: 'Television', sub: 'HDMI 2' },
    ],
  },
  {
    key: 'off',
    title: 'Off',
    data: [
      { id: 'fan', name: 'Office fan', sub: 'Idle' },
      { id: 'kettle', name: 'Kettle', sub: 'Idle' },
      { id: 'vac', name: 'Vacuum', sub: 'Docked' },
    ],
  },
];
const list = (
  <VirtualList
    sections={sections}
    keyOf={(i) => i.id}
    renderItem={(i) => <ListRow title={i.name} subtitle={i.sub} icon="plug" chevron />}
  />
);
export const Grouped = () => (
  <Stage theme="dark" width={520} height={420}>
    {list}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520} height={420}>
    {list}
  </Stage>
);
