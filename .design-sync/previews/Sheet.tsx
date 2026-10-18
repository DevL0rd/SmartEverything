import { GlobalTheme, Button, ListRow, Sheet, Stage, Text } from 'smarteverything-kit';

const body = (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Text variant="callout" tone="variant">
      Choose how the lamp behaves when power returns after an outage.
    </Text>
    <ListRow title="Restore last state" subtitle="Recommended" icon="reset" selected />
    <ListRow title="Always on" icon="power" />
    <ListRow title="Always off" icon="close" />
  </div>
);
const footer = (
  <div style={{ display: 'flex', gap: 8, padding: '0 24px 16px', justifyContent: 'flex-end' }}>
    <Button label="Cancel" variant="text" />
    <Button label="Save" />
  </div>
);
export const Dark = () => (
  <Stage theme="dark">
    <Sheet open onClose={() => undefined} title="Power-on behaviour" footer={footer}>
      {body}
    </Sheet>
  </Stage>
);
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">
      <Sheet open onClose={() => undefined} title="Power-on behaviour" footer={footer}>
        {body}
      </Sheet>
    </Stage>
  </GlobalTheme>
);
