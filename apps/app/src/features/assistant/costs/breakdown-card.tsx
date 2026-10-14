import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { UsagePart } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ProgressBar } from '../../../components/charts';
import { IconButton } from '../../../components/icon-button';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { CardEmpty, CostCard } from './cost-card';
import { plural } from '../../../format/text';
import { useMoney } from '../../region';
import { ProviderLogo } from '../picker/provider-logo';
import { DIMENSION_INFO, partIcon, partTitle, providerOfModel } from './costs-dimensions';
import type { CostDimension } from './costs-params';

const SHOWN = 6;

function Leading({
  dimension,
  part,
}: {
  readonly dimension: CostDimension;
  readonly part: UsagePart;
}): ReactNode {
  const provider = dimension === 'model' ? providerOfModel(part.key) : null;
  if (provider !== null) {
    return <ProviderLogo provider={provider.id} name={provider.name} />;
  }
  return (
    <IconWell
      icon={partIcon(dimension, part.key)}
      colour={DIMENSION_INFO[dimension].colour}
      size="m"
    />
  );
}

interface RowProps {
  readonly dimension: CostDimension;
  readonly part: UsagePart;
  readonly share: number;
  readonly onFilter: (key: string) => void;
}

function PartRow({ dimension, part, share, onFilter }: RowProps): ReactNode {
  const title = partTitle(part);
  const money = useMoney();
  const cost = `${money.cost(part.cost_micros)}${(part.unknown_count ?? 0) > 0 ? ' + unavailable' : ''}`;
  return (
    <View className="flex-row items-center gap-1">
      <Interactive
        label={`${title}, ${cost}. Show only this`}
        onPress={() => {
          onFilter(part.key);
        }}
        className="-mx-2 min-h-touch-min min-w-0 flex-1 flex-row items-center gap-3 rounded-md px-2 py-1.5"
        layerClassName="rounded-md"
      >
        <Leading dimension={dimension} part={part} />
        <View className="min-w-0 flex-1 gap-1.5">
          <View className="flex-row items-baseline gap-2">
            <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
              {title}
            </Text>
            <Text variant="body-strong" className="tabular">
              {cost}
            </Text>
          </View>
          <ProgressBar progress={share} colour={DIMENSION_INFO[dimension].colour} label={title} />
          <Text variant="caption" tone="faint">
            {plural(part.count, 'request')}
          </Text>
        </View>
      </Interactive>
      {dimension === 'chat' ? (
        <IconButton icon="sparkles" label={`Open ${title}`} href={href.assistantChat(part.key)} />
      ) : null}
    </View>
  );
}

export interface BreakdownCardProps {
  readonly dimension: CostDimension;
  readonly parts: readonly UsagePart[];
  readonly onFilter: (dimension: CostDimension, key: string) => void;
}

export function BreakdownCard({ dimension, parts, onFilter }: BreakdownCardProps): ReactNode {
  const info = DIMENSION_INFO[dimension];
  const top = Math.max(1, ...parts.map((part) => part.cost_micros));
  const rest = parts.length - SHOWN;
  return (
    <CostCard title={info.heading} icon={info.icon} accent={info.colour}>
      {parts.length === 0 ? (
        <CardEmpty icon={info.icon} colour={info.colour} title="Nothing here in these dates" />
      ) : (
        <View className="gap-2">
          {parts.slice(0, SHOWN).map((part) => (
            <PartRow
              key={part.key}
              dimension={dimension}
              part={part}
              share={part.cost_micros / top}
              onFilter={(key) => {
                onFilter(dimension, key);
              }}
            />
          ))}
          {rest > 0 ? (
            <Text variant="caption" tone="variant">
              {`${String(rest)} more — use the ${info.label.toLowerCase()} filter to see them`}
            </Text>
          ) : null}
        </View>
      )}
    </CostCard>
  );
}
