import { DecisionFrame, Stage, Text } from 'smarteverything-kit';

const requests = [
  { id: 'r1', content: <Text>Allow the assistant to turn off the hallway lights?</Text> },
  { id: 'r2', content: <Text>Allow the assistant to read the front door lock history?</Text> },
];
export const Requests = () => (
  <Stage theme="dark" width={480}>
    <DecisionFrame source="Home assistant" requests={requests} unavailable={null} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <DecisionFrame source="Home assistant" requests={requests} unavailable={null} />
  </Stage>
);
