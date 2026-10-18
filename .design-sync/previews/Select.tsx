import { useState } from 'react';
import { Select, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const rooms = [
  { value: 'living', label: 'Living room', description: '6 devices' },
  { value: 'bedroom', label: 'Bedroom', description: '4 devices' },
  { value: 'kitchen', label: 'Kitchen', description: '9 devices' },
];
function Demo() {
  const [room, setRoom] = useState('living');
  const [empty, setEmpty] = useState('');
  return (
    <Col gap={16}>
      <Select label="Room" options={rooms} value={room} onChange={setRoom} />
      <Select
        label="Default scene"
        options={rooms}
        value={empty}
        onChange={setEmpty}
        placeholder="Choose a scene"
      />
      <Select label="Locked" options={rooms} value="kitchen" onChange={() => undefined} disabled />
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
