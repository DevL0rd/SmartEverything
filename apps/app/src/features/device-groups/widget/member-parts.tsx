import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { DotStrip, type Dot } from '../../../components/dot-strip';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { DeviceFace } from '../../devices';
import { CHIP_METRICS, planChips } from '../group-layout';
import { listLabel, memberNoun, moreLabel } from '../group-summary';
import type { GroupData } from './use-group-data';

const CHIP_BOX = { width: CHIP_METRICS.width } as const;
const STRIP_GAP = { gap: CHIP_METRICS.gap } as const;

export function ShowAll({
  label,
  hint,
  href,
}: {
  readonly label: string;
  readonly hint: string;
  readonly href: Href;
}): ReactNode {
  return (
    <Interactive
      href={href}
      label={hint}
      className="min-h-touch-min justify-center rounded-xs px-2"
      layerClassName="rounded-xs"
    >
      <Text variant="label" tone="primary" numberOfLines={1}>
        {label}
      </Text>
    </Interactive>
  );
}

export function DotPill({ data }: { readonly data: GroupData }): ReactNode {
  const dots: readonly Dot[] = data.members.map((member) => ({
    key: member.id,
    colour: data.view.colours[member.id] ?? null,
    state: data.view.powers[member.id] ?? 'off',
  }));
  return (
    <View className="self-start rounded-full bg-surface-1/70 px-2 py-1.5">
      <DotStrip dots={dots} />
    </View>
  );
}

export function ChipStrip({
  data,
  width,
}: {
  readonly data: GroupData;
  readonly width: number;
}): ReactNode {
  const plan = planChips(width, data.members.length);
  const noun = memberNoun(data.lights);
  return (
    <View
      role="group"
      aria-label={listLabel(noun, data.name)}
      className="min-h-touch-min flex-row items-center"
      style={STRIP_GAP}
    >
      {data.members.slice(0, plan.shown).map((member) => (
        <View key={member.id} style={CHIP_BOX}>
          <DeviceFace deviceId={member.id} face="chip" context="nested" />
        </View>
      ))}
      {plan.hidden > 0 ? (
        <ShowAll
          label={`+${String(plan.hidden)} more`}
          hint={`${moreLabel(plan.hidden, noun)} in ${data.name}`}
          href={data.href}
        />
      ) : null}
    </View>
  );
}
