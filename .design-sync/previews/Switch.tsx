import { useState } from 'react';
import { Stage, Switch, Text } from 'smarteverything-kit';
import { Col, Row } from '../preview-helpers';

function Demo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <Col>
      <Row>
        <Switch value={a} onChange={setA} label="Porch light" />
        <Text>Porch light</Text>
      </Row>
      <Row>
        <Switch value={b} onChange={setB} label="Night mode" />
        <Text>Night mode</Text>
      </Row>
      <Row>
        <Switch value mixed onChange={() => undefined} label="Some lights on" />
        <Text>Mixed (some lights on)</Text>
      </Row>
      <Row>
        <Switch value disabled onChange={() => undefined} label="Locked" />
        <Text tone="faint">Disabled</Text>
      </Row>
    </Col>
  );
}
export const States = () => (
  <Stage theme="dark" width={420}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    <Demo />
  </Stage>
);
