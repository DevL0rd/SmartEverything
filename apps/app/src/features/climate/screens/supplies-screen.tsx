import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Section } from '../../../components/section';
import { MaintenanceCard } from '../../devices';
import { useClimateSources } from '../model/climate-devices';
import { hasSupplies } from '../model/supplies';

export function SuppliesScreen(): ReactNode {
  const sources = useClimateSources(null).filter(hasSupplies);
  const header = <PageHeader title="Filters & water" />;
  if (sources.length === 0) {
    return (
      <Screen header={header} maxWidth="reading">
        <EmptyState
          icon="wrench"
          title="Nothing to look after"
          body="Filters and water tanks of your climate devices show up here."
          action={<Button label="Back to Devices" href={href.devices()} />}
        />
      </Screen>
    );
  }
  return (
    <Screen header={header} maxWidth="reading">
      <View className="gap-section-gap">
        {sources.map(({ model }) => (
          <Section key={model.device.id} title={model.device.label}>
            <MaintenanceCard device={model.device} />
          </Section>
        ))}
      </View>
    </Screen>
  );
}
