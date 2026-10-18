import { ActionRow, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={4}>
    <ActionRow
      title="Restart hub"
      subtitle="Takes about a minute"
      icon="reset"
      onPress={() => undefined}
    />
    <ActionRow title="Export automations" icon="upload" onPress={() => undefined} />
    <ActionRow title="Sign out" icon="away" destructive onPress={() => undefined} />
    <ActionRow title="Clear cache" icon="close" disabled onPress={() => undefined} />
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
