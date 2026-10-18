import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { Block } from './block';
import type { CycleView } from './cycles';
import { DrumBlock } from './drum-block';
import { countsText, drumCleanOf, isDue } from './maintenance-model';
import { TankBlock } from './tank-block';
import type { Laundry } from './use-laundry';

const FILTER_STEPS =
  '1. Switch the machine off. 2. Open the filter flap and unscrew the filter. 3. Rinse it and screw it back in.';

function FilterBlock({ needed }: { readonly needed: boolean }): ReactNode {
  return needed ? (
    <Block
      icon="wrench"
      tone="warning"
      title="Clean the filter"
      sub={FILTER_STEPS}
      divider={false}
    />
  ) : null;
}

function AllGood({ counts }: { readonly counts: string | null }): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-2">
      <Icon name="circleCheck" size={20} tone="positive" />
      <Text variant="body" className="tabular">
        {counts === null ? 'All good' : `All good · ${counts}`}
      </Text>
    </View>
  );
}

function ToolsToggle({
  open,
  onToggle,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const text = open ? 'Hide maintenance tools' : 'Maintenance tools ›';
  return (
    <Interactive
      label={open ? 'Hide maintenance tools' : 'Maintenance tools'}
      expanded={open}
      onPress={onToggle}
      className="min-h-touch-min justify-center self-start"
    >
      <Text variant="body-strong" className="underline">
        {text}
      </Text>
    </Interactive>
  );
}

export function MaintenanceCard({
  laundry,
  cycles,
}: {
  readonly laundry: Laundry;
  readonly cycles: CycleView;
}): ReactNode {
  const [tools, setTools] = useState(false);
  const { values } = laundry.snapshot;
  const clean = drumCleanOf(cycles.cycles, useMinute());
  const due = isDue(values, clean);
  const counts = countsText(values.wash_count, values.dry_count);
  const open = due || tools;
  return (
    <Card title="Maintenance">
      <View className="gap-3">
        <FilterBlock needed={values.filter_clean === true} />
        {open && laundry.roles.has('laundry_program') ? (
          <DrumBlock laundry={laundry} clean={clean} />
        ) : null}
        {open && laundry.roles.has('tank_clean_start') ? <TankBlock laundry={laundry} /> : null}
        {due ? null : <AllGood counts={counts} />}
        {due && counts !== null ? (
          <Text variant="footnote" tone="variant" className="tabular">
            {counts}
          </Text>
        ) : null}
        {due ? null : (
          <ToolsToggle
            open={tools}
            onToggle={() => {
              setTools(!tools);
            }}
          />
        )}
      </View>
    </Card>
  );
}
