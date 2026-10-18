import { Stage, WidgetEmpty } from 'smarteverything-kit';

const body = (
  <div style={{ width: 300, height: 170 }}>
    <WidgetEmpty
      icon="cameras"
      colour="viz-3"
      title="No cameras yet"
      body="Add a camera to see live video here."
      action={{ label: 'Add camera', href: '/cameras/add' }}
      size="M"
    />
  </div>
);
export const Empty = () => (
  <Stage theme="dark" width={340}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={340}>
    {body}
  </Stage>
);
