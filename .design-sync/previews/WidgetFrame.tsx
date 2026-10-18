import { Figure, Stage, Text, WidgetFrame } from 'smarteverything-kit';

const card = (size: 'S' | 'M' | 'L', theme: 'dark' | 'light') => (
  <div style={{ width: 280, height: size === 'L' ? 240 : 150 }}>
    <WidgetFrame
      title="Climate"
      icon="thermometer"
      accent="temp-warm"
      size={size}
      href="/climate"
      glow={theme === 'dark' ? 'temp-warm' : null}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Figure value="21.5" unit="C" size="l" tone="primary" />
        <Text variant="caption" tone="variant">
          Living room, 48% humidity
        </Text>
      </div>
    </WidgetFrame>
  </div>
);
export const Sizes = () => (
  <Stage theme="dark" width={620}>
    <div style={{ display: 'flex', gap: 16 }}>
      {card('M', 'dark')}
      {card('L', 'dark')}
    </div>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={620}>
    <div style={{ display: 'flex', gap: 16 }}>
      {card('M', 'light')}
      {card('L', 'light')}
    </div>
  </Stage>
);
