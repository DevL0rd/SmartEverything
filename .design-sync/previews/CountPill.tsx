import { CountPill, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const body = (
  <Row gap={16}>
    <CountPill count={3} />
    <CountPill count={12} label="12 unread alerts" />
    <CountPill count={99} />
    <CountPill count={128} />
  </Row>
);
export const Counts = () => (
  <Stage theme="dark" width={420}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    {body}
  </Stage>
);
