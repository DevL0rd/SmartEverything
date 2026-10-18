import { Badge, ListRow, Stage, Switch } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={4}>
    <ListRow title="Living room lamp" subtitle="On, 65% brightness" icon="lamp" chevron />
    <ListRow
      title="Front door"
      subtitle="Locked 8 minutes ago"
      icon="lock"
      iconTone="positive"
      value="Locked"
    />
    <ListRow
      title="Hallway camera"
      subtitle="Offline since 06:12"
      subtitleTone="critical"
      icon="camera"
      trailing={<Badge label="Offline" tone="critical" />}
    />
    <ListRow
      title="Night mode"
      icon="moon"
      trailing={<Switch value onChange={() => undefined} label="Night mode" />}
    />
    <ListRow title="Remove device" icon="close" destructive onPress={() => undefined} />
    <ListRow
      title="Selected row"
      subtitle="Highlighted as the current choice"
      icon="check"
      selected
    />
    <ListRow title="Unavailable" subtitle="Requires the hub" icon="plug" disabled />
  </Col>
);
export const Variants = () => (
  <Stage theme="dark" width={480}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    {body}
  </Stage>
);
