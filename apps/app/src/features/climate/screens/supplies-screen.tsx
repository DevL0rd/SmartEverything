import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Grid } from '../../../components/grid';
import { PageShell } from '../../../components/page-shell/page-shell';
import { Text } from '../../../components/text';
import { MaintenanceCard } from '../../devices';
import { useClimateSources } from '../model/climate-devices';
import { hasSupplies } from '../model/supplies';

const MIN_SUPPLY_CARD_WIDTH = 420;

const TITLE = 'Filters & water';

export function SuppliesScreen(): ReactNode {
  const sources = useClimateSources(null).filter(hasSupplies);
  if (sources.length === 0) {
    return (
      <PageShell title={TITLE} width="reading">
        <EmptyState
          icon="wrench"
          title="Nothing to look after"
          body="Filters and water tanks of your climate devices show up here."
          action={<Button label="Back to Devices" href={href.devices()} />}
        />
      </PageShell>
    );
  }
  return (
    <PageShell title={TITLE}>
      <Grid
        minItemWidth={MIN_SUPPLY_CARD_WIDTH}
        maxColumns={sources.length}
        cellClassName="max-w-reading"
        stretchLastRow={false}
      >
        {sources.map(({ model }) => (
          <View key={model.device.id} className="gap-1">
            <Text variant="footnote" tone="variant" accessibilityRole="header" className="px-4">
              {model.device.label}
            </Text>
            <MaintenanceCard device={model.device} />
          </View>
        ))}
      </Grid>
    </PageShell>
  );
}
