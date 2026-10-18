import { Stage, Text } from 'smarteverything-kit';

const col = { display: 'flex', flexDirection: 'column' as const, gap: 6 };

export const TypeScale = () => (
  <Stage theme="dark" width={520}>
    <div style={col}>
      <Text variant="large-title">Good evening, Dana</Text>
      <Text variant="title-1">Home overview</Text>
      <Text variant="title-2">Living room</Text>
      <Text variant="title-3">Evening lights scene</Text>
      <Text variant="body">
        Lights fade to 40% warm white at sunset and the blinds close automatically.
      </Text>
      <Text variant="body-strong">Scene runs daily at 18:30</Text>
      <Text variant="callout">Last run yesterday, 18:30</Text>
      <Text variant="footnote">Triggered by sunset offset of 15 minutes</Text>
      <Text variant="caption">Updated 2 minutes ago</Text>
      <Text variant="label">Brightness</Text>
    </div>
  </Stage>
);

export const Tones = () => (
  <Stage theme="dark" width={520}>
    <div style={col}>
      <Text>Default text on the page surface</Text>
      <Text tone="variant">Secondary supporting text</Text>
      <Text tone="faint">Faint hint text</Text>
      <Text tone="primary">Accent text for emphasis</Text>
      <Text tone="positive">All 12 devices are online</Text>
      <Text tone="warning">Battery low on the hallway sensor</Text>
      <Text tone="critical">Connection to the hub was lost</Text>
      <Text tone="info">A firmware update is available</Text>
    </div>
  </Stage>
);

export const LightTheme = () => (
  <Stage theme="light" width={520}>
    <div style={col}>
      <Text variant="title-1">Home overview</Text>
      <Text variant="body">
        Lights fade to 40% warm white at sunset and the blinds close automatically.
      </Text>
      <Text tone="variant" variant="callout">
        Secondary supporting text
      </Text>
      <Text tone="critical" variant="callout">
        Connection to the hub was lost
      </Text>
      <Text tone="positive" variant="callout">
        All 12 devices are online
      </Text>
    </div>
  </Stage>
);
