import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { RoleChoice, RoleSwitch } from './parts';
import type { Laundry } from './use-laundry';

const AMOUNTS = [
  { value: 'Few', label: 'Less' },
  { value: 'Standard', label: 'Standard' },
  { value: 'Many', label: 'More' },
  { value: 'Lots Of', label: 'Most' },
] as const;

function Level({ low }: { readonly low: boolean }): ReactNode {
  return (
    <View className="ml-auto flex-row items-center gap-1.5">
      <View className={cn('size-2.5 rounded-full', low ? 'bg-caution' : 'bg-positive')} />
      <Text variant="footnote" tone={low ? 'warning' : 'variant'}>
        {low ? 'Low' : 'Normal'}
      </Text>
    </View>
  );
}

function Tank({
  laundry,
  title,
  level,
  auto,
  amount,
  divider = false,
  children,
}: {
  readonly laundry: Laundry;
  readonly title: string;
  readonly level: 'detergent_level' | 'softener_level';
  readonly auto: 'detergent_auto' | 'softener_auto';
  readonly amount: 'detergent_amount' | 'softener_amount';
  readonly divider?: boolean;
  readonly children?: ReactNode;
}): ReactNode {
  const { values } = laundry.snapshot;
  if (!laundry.roles.has(level) && !laundry.roles.has(auto)) {
    return null;
  }
  return (
    <View className={cn('gap-2', divider && 'border-t-hairline border-outline-variant pt-3')}>
      <View className="flex-row items-center gap-2">
        <Text variant="body-strong">{title}</Text>
        {values[level] === undefined ? null : <Level low={values[level] === 'Low'} />}
      </View>
      <RoleSwitch laundry={laundry} source={auto} title="Auto-dose" />
      {values[auto] === false ? null : (
        <RoleChoice laundry={laundry} source={amount} label={`${title} amount`} options={AMOUNTS} />
      )}
      {children}
    </View>
  );
}

export function CareCard({ laundry }: { readonly laundry: Laundry }): ReactNode {
  const disinfectant = laundry.snapshot.values.disinfectant === true;
  return (
    <Card title="Care">
      <View className="gap-3">
        <Tank
          laundry={laundry}
          title="Detergent"
          level="detergent_level"
          auto="detergent_auto"
          amount="detergent_amount"
        />
        <Tank
          laundry={laundry}
          title={disinfectant ? 'Disinfectant' : 'Softener'}
          level="softener_level"
          auto="softener_auto"
          amount="softener_amount"
          divider
        >
          <RoleSwitch
            laundry={laundry}
            source="disinfectant"
            title="Disinfectant in this tank"
            sub="The softener tank holds disinfectant instead."
          />
        </Tank>
      </View>
    </Card>
  );
}
