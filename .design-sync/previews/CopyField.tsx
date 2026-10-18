import { CopyField, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={16}>
    <CopyField label="Hub URL" value="https://hub.home.example:8443" />
    <CopyField label="Pairing token" value="se-pair-7f3a-91c2-b08d" />
  </Col>
);
export const Fields = () => (
  <Stage theme="dark" width={460}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    {body}
  </Stage>
);
