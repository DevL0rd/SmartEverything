import type { ReactNode } from 'react';
import { GlobalTheme, ModalOverlay, Stage, Text } from 'smarteverything-kit';

const close = (): void => undefined;
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
export const Dark = (): ReactNode => (
  <Stage theme="dark">
    <ModalOverlay
      open
      onClose={close}
      label="Example overlay"
      scrim
      className="items-center justify-center"
    >
      {panel}
    </ModalOverlay>
  </Stage>
);
export const Light = (): ReactNode => (
  <GlobalTheme theme="light">
    <Stage theme="light">
      <ModalOverlay
        open
        onClose={close}
        label="Example overlay"
        scrim
        className="items-center justify-center"
      >
        {panel}
      </ModalOverlay>
    </Stage>
  </GlobalTheme>
);
