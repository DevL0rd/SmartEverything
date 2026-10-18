import { CornerButton, Stage, WidgetFrame, Text } from 'smarteverything-kit';

const body = (
  <div style={{ position: 'relative', width: 280, height: 150, margin: 12 }}>
    <WidgetFrame title="Climate" icon="thermometer" accent="temp-warm" size="M">
      <Text variant="callout" tone="variant">
        Editing layout
      </Text>
    </WidgetFrame>
    <CornerButton corner="top-left" icon="minus" label="Remove widget" onPress={() => undefined} />
    <CornerButton
      corner="top-right"
      icon="settings"
      label="Widget options"
      onPress={() => undefined}
    />
  </div>
);
export const Corners = () => (
  <Stage theme="dark" width={340}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={340}>
    {body}
  </Stage>
);
