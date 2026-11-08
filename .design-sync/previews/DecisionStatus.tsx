import type { ReactElement } from 'react';
import { DecisionStatus, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={8}>
    <DecisionStatus pending received={false} error={null} />
    <DecisionStatus pending={false} received error={null} />
    <DecisionStatus
      pending={false}
      received={false}
      error={new Error('The request already closed')}
    />
  </Col>
);
export const States = (): ReactElement => (
  <Stage theme="dark" width={460}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={460}>
    {body}
  </Stage>
);
