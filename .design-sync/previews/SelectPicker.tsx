import { GlobalTheme, SelectPicker, Stage, Text } from 'smarteverything-kit';

const options = [
  { value: 'living', label: 'Living room', description: '6 devices' },
  { value: 'bedroom', label: 'Bedroom', description: '4 devices' },
  { value: 'kitchen', label: 'Kitchen', description: '9 devices' },
  { value: 'office', label: 'Office', description: '3 devices' },
];
const anchor = { x: 80, y: 90, width: 300, height: 44 };
export const Dark = () => (
  <Stage theme="dark">
    <Text>Room</Text>
    <SelectPicker
      label="Room"
      options={options}
      value="bedroom"
      anchor={anchor}
      onPick={() => undefined}
      onClose={() => undefined}
    />
  </Stage>
);
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">
      <Text>Room</Text>
      <SelectPicker
        label="Room"
        options={options}
        value="bedroom"
        anchor={anchor}
        onPick={() => undefined}
        onClose={() => undefined}
      />
    </Stage>
  </GlobalTheme>
);
