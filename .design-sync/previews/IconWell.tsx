import { IconWell, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const body = (
  <Row gap={16}>
    <IconWell icon="lamp" colour="temp-warm" size="s" />
    <IconWell icon="thermometer" colour="temp-cool" size="m" />
    <IconWell icon="droplet" colour="humidity" size="l" />
    <IconWell icon="activity" colour="move" size="m" />
    <IconWell icon="moon" colour="sleep-core" size="m" />
    <IconWell icon="shield" colour="positive" size="m" />
  </Row>
);
export const Sizes = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
