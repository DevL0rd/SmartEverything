import { Dot, Stage, Text } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const tones = ['primary', 'positive', 'warning', 'critical', 'info'] as const;
const body = (
  <Row gap={20}>
    {tones.map((t) => (
      <Row key={t} gap={8}>
        <Dot tone={t} />
        <Text variant="callout">{t}</Text>
      </Row>
    ))}
  </Row>
);
export const Tones = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
