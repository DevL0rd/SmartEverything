import {
  Card,
  ListRow,
  PageHeader,
  Screen,
  Section,
  Stage,
  StatTile,
  Text,
} from 'smarteverything-kit';

const page = (
  <Screen
    header={<PageHeader title="Home" subtitle="Good evening, Dana" />}
    maxWidth="dashboard"
    primaryAction={{ label: 'Add device', icon: 'plus', onPress: () => undefined }}
  >
    <Section title="Overview">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatTile label="Temperature" value="21.5" unit="C" tone="primary" caption="Living room" />
        <StatTile label="Humidity" value="48" unit="%" tone="info" caption="Comfortable" />
        <StatTile
          label="Energy today"
          value="6.2"
          unit="kWh"
          tone="positive"
          caption="12% below average"
        />
      </div>
    </Section>
    <Section title="Rooms">
      <Card padding="none">
        <ListRow title="Living room" subtitle="6 devices" icon="home" chevron />
        <ListRow title="Bedroom" subtitle="4 devices" icon="moon" chevron />
      </Card>
    </Section>
    <Text variant="footnote" tone="faint">
      Last synced 2 minutes ago
    </Text>
  </Screen>
);
export const Dashboard = () => (
  <Stage theme="dark" width={820} height={560}>
    {page}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={820} height={560}>
    {page}
  </Stage>
);
