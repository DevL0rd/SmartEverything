import { type ReactElement, useState } from 'react';
import { Stage, TimeField } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

function Demo(): ReactElement {
  const [a, setA] = useState({ hour: 18, minute: 30 });
  const [b, setB] = useState({ hour: 7, minute: 5 });
  return (
    <Col gap={16}>
      <TimeField label="Start time" value={a} onChange={setA} hour24={false} />
      <TimeField label="Wake up (24 hour)" value={b} onChange={setB} hour24 />
    </Col>
  );
}
export const Fields = (): ReactElement => (
  <Stage theme="dark" width={420}>
    <Demo />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={420}>
    <Demo />
  </Stage>
);
