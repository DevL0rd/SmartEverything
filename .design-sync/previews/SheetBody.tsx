import { ListRow, SheetBody, Stage } from 'smarteverything-kit';

const rows = (
  <>
    <ListRow title="Living room" icon="home" />
    <ListRow title="Bedroom" icon="moon" />
    <ListRow title="Kitchen" icon="kettle" />
  </>
);
const body = (
  <div style={{ height: 180, display: 'flex', flexDirection: 'column' }}>
    <SheetBody scroll={false} padding="px-6 pb-6 pt-2">
      {rows}
    </SheetBody>
  </div>
);
export const Static = () => (
  <Stage theme="dark" width={420}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    {body}
  </Stage>
);
