import { IconButton, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const body = (
  <Row gap={16}>
    <IconButton icon="plus" label="Add device" variant="filled" />
    <IconButton icon="settings" label="Settings" variant="tonal" />
    <IconButton icon="search" label="Search" variant="standard" />
    <IconButton icon="eye" label="Show" variant="overlay" />
    <IconButton icon="bell" label="Alerts" variant="standard" selected />
    <IconButton icon="power" label="Power" variant="tonal" disabled />
  </Row>
);
export const Variants = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
