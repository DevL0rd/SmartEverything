import { StatusChip, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const all = ['live', 'attention', 'stale', 'offline', 'blocked', 'privacy'] as const;
const body = (
  <Row>
    {all.map((s) => (
      <StatusChip key={s} status={s} />
    ))}
  </Row>
);
export const AllStatuses = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const CustomLabel = () => (
  <Stage theme="dark" width={520}>
    <Row>
      <StatusChip status="live" label="Recording" />
      <StatusChip status="offline" label="Hub unreachable" />
      <StatusChip status="privacy" label="Privacy mode on" />
    </Row>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
