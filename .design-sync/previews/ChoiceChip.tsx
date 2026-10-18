import { useState } from 'react';
import { ChoiceChip, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const rooms = [
  { value: 'all', label: 'All rooms' },
  { value: 'living', label: 'Living room' },
  { value: 'bedroom', label: 'Bedroom' },
];
function Demo() {
  const [a, setA] = useState('all');
  const [b, setB] = useState('bedroom');
  return (
    <Row>
      <ChoiceChip label="Room" icon="home" options={rooms} value={a} all="all" onChange={setA} />
      <ChoiceChip label="Room" icon="home" options={rooms} value={b} all="all" onChange={setB} />
    </Row>
  );
}
export const Chips = () => (
  <Stage theme="dark" width={460}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    <Demo />
  </Stage>
);
