import { GlobalTheme, ListRow, Popover, Stage, Text } from 'smarteverything-kit';

const anchor = { x: 240, y: 90, width: 140, height: 40 };
const body = (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <ListRow title="Rename" icon="customize" />
    <ListRow title="Move to room" icon="home" />
    <ListRow title="Device details" icon="settings" />
  </div>
);
export const Dark = () => (
  <Stage theme="dark">
    <Text>Device header</Text>
    <Popover open onClose={() => undefined} anchor={anchor} label="Device actions" width={260}>
      {body}
    </Popover>
  </Stage>
);
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">
      <Text>Device header</Text>
      <Popover open onClose={() => undefined} anchor={anchor} label="Device actions" width={260}>
        {body}
      </Popover>
    </Stage>
  </GlobalTheme>
);
