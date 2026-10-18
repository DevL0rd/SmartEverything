import { GlobalTheme, Overlay, Stage, Text } from 'smarteverything-kit';

const panel = (
  <div
    style={{
      margin: 'auto',
      padding: 24,
      borderRadius: 16,
      background: 'var(--color-surface-raised)',
      border: '1px solid var(--color-outline)',
      maxWidth: 320,
    }}
  >
    <Text variant="title-3">Scrimmed overlay</Text>
    <Text variant="callout" tone="variant">
      Overlay renders its children above the page with an optional scrim and closes on Escape.
    </Text>
  </div>
);
export const Dark = () => (
  <Stage theme="dark">
    <Overlay
      open
      onClose={() => undefined}
      label="Example overlay"
      scrim
      className="items-center justify-center"
    >
      {panel}
    </Overlay>
  </Stage>
);
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">
      <Overlay
        open
        onClose={() => undefined}
        label="Example overlay"
        scrim
        className="items-center justify-center"
      >
        {panel}
      </Overlay>
    </Stage>
  </GlobalTheme>
);
