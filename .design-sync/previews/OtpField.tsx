import { useState } from 'react';
import { OtpField, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

function Demo() {
  const [pair, setPair] = useState('482');
  const [code, setCode] = useState('1234');
  return (
    <Col gap={20}>
      <OtpField label="Pairing code" format="pairing" value={pair} onChange={setPair} />
      <OtpField
        label="Verification code"
        format={{ digits: 6 }}
        value={code}
        onChange={setCode}
        error="That code has expired"
      />
    </Col>
  );
}
export const Formats = () => (
  <Stage theme="dark" width={460}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    <Demo />
  </Stage>
);
