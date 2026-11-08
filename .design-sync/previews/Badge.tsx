import type { ReactElement } from 'react';
import { Badge, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const tones = ['neutral', 'primary', 'positive', 'warning', 'critical', 'info'] as const;

export const Tones = (): ReactElement => (
  <Stage theme="dark" width={520}>
    <Row>
      {tones.map((t) => (
        <Badge
          key={t}
          label={t === 'neutral' ? 'Idle' : t.charAt(0).toUpperCase() + t.slice(1)}
          tone={t}
        />
      ))}
    </Row>
  </Stage>
);
export const WithIcon = (): ReactElement => (
  <Stage theme="dark" width={520}>
    <Row>
      <Badge label="Armed" tone="positive" icon="shield" />
      <Badge label="Low battery" tone="warning" icon="power" />
      <Badge label="Offline" tone="critical" icon="wifi" />
    </Row>
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={520}>
    <Row>
      {tones.map((t) => (
        <Badge
          key={t}
          label={t === 'neutral' ? 'Idle' : t.charAt(0).toUpperCase() + t.slice(1)}
          tone={t}
        />
      ))}
    </Row>
  </Stage>
);
