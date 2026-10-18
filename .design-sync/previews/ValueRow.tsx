import { Stage, ValueRow } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={4}>
    <ValueRow title="Hub name" value="Home hub" icon="router" />
    <ValueRow title="Version" value="0.1.0" subtitle="Up to date" />
    <ValueRow title="Last sync" value="2 minutes ago" caption="Xiaomi cloud" />
  </Col>
);
export const Rows = () => (
  <Stage theme="dark" width={480}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    {body}
  </Stage>
);
