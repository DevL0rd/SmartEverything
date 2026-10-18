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
export const States = () => (
  <Stage theme="dark" width={460}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    {body}
  </Stage>
);
