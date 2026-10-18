import { useState } from 'react';
import { Stage, TextField } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

function Demo() {
  const [name, setName] = useState('Living room lamp');
  const [email, setEmail] = useState('dana@example.com');
  const [note, setNote] = useState('');
  return (
    <Col gap={16}>
      <TextField
        label="Device name"
        value={name}
        onChange={setName}
        helper="Shown in rooms and automations"
      />
      <TextField
        label="Email"
        kind="email"
        value={email}
        onChange={setEmail}
        error="Enter a valid address"
      />
      <TextField
        label="Notes"
        multiline
        value={note}
        onChange={setNote}
        placeholder="Anything worth remembering about this device"
      />
      <TextField label="Hub address" value="192.168.1.20" onChange={() => undefined} disabled />
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
