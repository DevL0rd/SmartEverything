import { Interactive, Stage, Text } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col>
    <Interactive
      label="Open living room"
      onPress={() => undefined}
      className="rounded-md bg-surface-1 p-4"
    >
      <Text>Pressable surface</Text>
    </Interactive>
    <Interactive
      label="Selected option"
      selected
      onPress={() => undefined}
      className="rounded-md border border-primary bg-primary-container p-4"
    >
      <Text tone="primary">Selected surface</Text>
    </Interactive>
    <Interactive
      label="Disabled option"
      disabled
      onPress={() => undefined}
      className="rounded-md bg-surface-1 p-4"
    >
      <Text tone="faint">Disabled surface</Text>
    </Interactive>
  </Col>
);
export const Surfaces = () => (
  <Stage theme="dark" width={420}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    {body}
  </Stage>
);
