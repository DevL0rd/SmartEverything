import { Stage, WidgetStat } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={16}>
    <WidgetStat
      icon="thermometer"
      colour="temp-warm"
      label="Temperature"
      value="21.5"
      unit="C"
      caption="Living room"
      tone="primary"
    />
    <WidgetStat
      icon="droplet"
      colour="humidity"
      label="Humidity"
      value="48"
      unit="%"
      caption="Comfortable"
    />
    <WidgetStat
      icon="wifi"
      colour="viz-3"
      label="Signal"
      value="--"
      caption="Sensor offline"
      stale
    />
  </Col>
);
export const Stats = () => (
  <Stage theme="dark" width={360}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={360}>
    {body}
  </Stage>
);
