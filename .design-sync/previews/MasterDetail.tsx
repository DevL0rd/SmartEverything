import { ListRow, MasterDetail, Stage, Text } from 'smarteverything-kit';

const master = (
  <div style={{ padding: 8 }}>
    <ListRow title="Living room lamp" subtitle="On" icon="lamp" selected />
    <ListRow title="Hallway camera" subtitle="Offline" icon="camera" />
    <ListRow title="Front door" subtitle="Locked" icon="lock" />
  </div>
);
const detail = (
  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Text variant="title-2">Living room lamp</Text>
    <Text tone="variant">
      On at 65% brightness. Last changed by the Evening lights scene at 18:30.
    </Text>
  </div>
);
export const Split = () => (
  <Stage theme="dark" width={880} height={300}>
    <MasterDetail master={master} detail={detail} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={880} height={300}>
    <MasterDetail master={master} detail={detail} />
  </Stage>
);
