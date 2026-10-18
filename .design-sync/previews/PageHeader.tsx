import { PageHeader, Screen, Stage, Text } from 'smarteverything-kit';

const actions = [
  { icon: 'plus' as const, label: 'Add device', primary: true, onPress: () => undefined },
  { icon: 'search' as const, label: 'Search', onPress: () => undefined },
];
const content = <Text tone="variant">Page content sits below the header.</Text>;
export const WithActions = () => (
  <Stage theme="dark" width={760} height={200}>
    <Screen
      header={
        <PageHeader
          title="Devices"
          subtitle="23 devices in 6 rooms"
          actions={actions}
          settings={{ href: '/settings/devices', label: 'Device settings' }}
        />
      }
    >
      {content}
    </Screen>
  </Stage>
);
export const Detail = () => (
  <Stage theme="dark" width={760} height={200}>
    <Screen
      header={
        <PageHeader
          title="Living room lamp"
          subtitle="Yeelight Color 1S"
          back
          breadcrumbs={[{ label: 'Devices', href: '/devices' }, { label: 'Living room' }]}
          overflow={[
            { label: 'Rename', icon: 'customize', onPress: () => undefined },
            { label: 'Remove', icon: 'close', destructive: true, onPress: () => undefined },
          ]}
        />
      }
    >
      {content}
    </Screen>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={760} height={200}>
    <Screen
      header={
        <PageHeader
          title="Devices"
          subtitle="23 devices in 6 rooms"
          actions={actions}
          settings={{ href: '/settings/devices', label: 'Device settings' }}
        />
      }
    >
      {content}
    </Screen>
  </Stage>
);
