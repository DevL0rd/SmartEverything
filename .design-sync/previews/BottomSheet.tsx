import { GlobalTheme, BottomSheet, ListRow, Stage } from 'smarteverything-kit';

const rows = (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <ListRow title="Living room" subtitle="6 devices" icon="home" />
    <ListRow title="Bedroom" subtitle="4 devices" icon="moon" />
    <ListRow title="Kitchen" subtitle="9 devices" icon="kettle" />
  </div>
);
export const Dark = () => (
  <Stage theme="dark">
    <BottomSheet
      open
      onClose={() => undefined}
      title="Move to room"
      label="Move to room"
      detents={['fit']}
    >
      {rows}
    </BottomSheet>
  </Stage>
);
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">
      <BottomSheet
        open
        onClose={() => undefined}
        title="Move to room"
        label="Move to room"
        detents={['fit']}
      >
        {rows}
      </BottomSheet>
    </Stage>
  </GlobalTheme>
);
