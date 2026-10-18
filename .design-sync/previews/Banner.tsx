import { Banner, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col>
    <Banner
      tone="info"
      title="Firmware 2.4.1 is available"
      body="Updating takes about five minutes and restarts the hub."
      action={{ label: 'Update now', onPress: () => undefined }}
    />
    <Banner
      tone="positive"
      title="Backup complete"
      body="All automations were saved to your hub."
      onDismiss={() => undefined}
    />
    <Banner
      tone="warning"
      title="Hallway sensor battery is low"
      body="Replace the CR2450 cell within a week."
    />
    <Banner
      tone="critical"
      title="Hub is offline"
      body="Devices cannot be controlled until the connection returns."
      action={{ label: 'Troubleshoot', onPress: () => undefined }}
    />
  </Col>
);
export const Tones = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
