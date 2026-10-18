import { GlobalTheme, Button, DialogFrame, Stage, Text } from 'smarteverything-kit';

const footer = (
  <div style={{ display: 'flex', gap: 8, padding: '0 24px 16px', justifyContent: 'flex-end' }}>
    <Button label="Keep device" variant="text" />
    <Button label="Remove" variant="destructive" />
  </div>
);
const body = (
  <Text variant="callout" tone="variant">
    The device and its history will be removed from this home. You can add it again later from the
    integrations page.
  </Text>
);
export const Dark = () => (
  <Stage theme="dark">
    <DialogFrame
      open
      onClose={() => undefined}
      label="Remove device"
      title="Remove Living room lamp?"
      kind="dialog"
      footer={footer}
    >
      {body}
    </DialogFrame>
  </Stage>
);
export const Inspector = () => (
  <Stage theme="dark">
    <DialogFrame
      open
      onClose={() => undefined}
      label="Device details"
      title="Device details"
      kind="inspector"
    >
      {body}
    </DialogFrame>
  </Stage>
);
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">
      <DialogFrame
        open
        onClose={() => undefined}
        label="Remove device"
        title="Remove Living room lamp?"
        kind="dialog"
        footer={footer}
      >
        {body}
      </DialogFrame>
    </Stage>
  </GlobalTheme>
);
