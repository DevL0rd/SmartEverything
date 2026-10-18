import { NavRow, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={4}>
    <NavRow
      title="Appearance"
      subtitle="Theme, accent and density"
      icon="settings"
      href="/settings/appearance"
    />
    <NavRow title="Notifications" value="On" icon="bell" href="/settings/notifications" />
    <NavRow
      title="Integrations"
      subtitle="Xiaomi, SmartThings, Tuya"
      icon="integrations"
      href="/settings/integrations"
      selected
    />
    <NavRow title="Advanced" icon="cpu" disabled />
  </Col>
);
export const Rows = () => (
  <Stage theme="dark" width={480}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    {body}
  </Stage>
);
