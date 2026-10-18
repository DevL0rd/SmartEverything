import { Badge, Button, Card, Stage, Text } from 'smarteverything-kit';

const body = (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Text variant="callout" tone="variant">
      Living room is at 21.5 C with 48% humidity. The heater has been idle for 40 minutes.
    </Text>
    <Badge label="Comfortable" tone="positive" />
  </div>
);

export const Default = () => (
  <Stage theme="dark" width={420}>
    <Card title="Climate" icon="thermometer" action={<Button label="Adjust" variant="text" />}>
      {body}
    </Card>
  </Stage>
);

export const Tones = () => (
  <Stage theme="dark" width={420}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card title="Front door" icon="lock" label="Front door lock">
        <Text variant="callout" tone="variant">
          Locked 8 minutes ago by Dana.
        </Text>
      </Card>
      <Card title="Hallway camera offline" icon="camera" tone="attention">
        <Text variant="callout" tone="variant">
          No frames received since 06:12. Check power and Wi-Fi.
        </Text>
      </Card>
      <Card title="Smoke alarm triggered" icon="smoke" tone="critical">
        <Text variant="callout" tone="variant">
          Kitchen detector reported smoke at 18:41.
        </Text>
      </Card>
    </div>
  </Stage>
);

export const Pressable = () => (
  <Stage theme="dark" width={420}>
    <Card title="Open the full report" icon="activity" onPress={() => undefined}>
      <Text variant="callout" tone="variant">
        Seven-day energy use is down 12% from last week.
      </Text>
    </Card>
  </Stage>
);

export const LightTheme = () => (
  <Stage theme="light" width={420}>
    <Card title="Climate" icon="thermometer" action={<Button label="Adjust" variant="text" />}>
      {body}
    </Card>
  </Stage>
);
