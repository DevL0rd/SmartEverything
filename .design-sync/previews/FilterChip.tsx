import { FilterChip, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const body = (
  <Row>
    <FilterChip
      label="Room"
      value="All rooms"
      icon="home"
      active={false}
      onPress={() => undefined}
    />
    <FilterChip label="Type" value="Lights" icon="bulb" active onPress={() => undefined} />
    <FilterChip label="Status" value="Offline" icon="wifi" active onPress={() => undefined} />
  </Row>
);
export const Chips = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
