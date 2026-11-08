import type { ReactNode } from 'react';
import { Stage, ToastCard } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const base = { id: 1, count: 1, leaving: false, held: false, undoable: false };
const body = (
  <Col>
    <ToastCard
      toast={{
        ...base,
        message: 'Scene saved',
        detail: 'Evening lights will run at sunset',
        tone: 'positive',
      }}
    />
    <ToastCard
      toast={{
        ...base,
        id: 2,
        message: 'Hub unreachable',
        detail: 'Retrying in 10 seconds',
        tone: 'critical',
        action: { label: 'Retry now', onPress: () => undefined },
      }}
    />
    <ToastCard toast={{ ...base, id: 3, message: 'Lamp turned off', count: 3 }} />
  </Col>
);
export const Tones = (): ReactNode => (
  <Stage theme="dark" width={420}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={420}>
    {body}
  </Stage>
);
