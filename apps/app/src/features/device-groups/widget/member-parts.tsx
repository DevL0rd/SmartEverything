import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from '../../../components/app-href';
import { Button } from '../../../components/button';
import { DotStrip, type Dot } from '../../../components/dot-strip';
import { ActionBand } from '../../../components/widget-board/action-band';
import { useIdiom } from '../../../design/platform';
import { useThemeSetting } from '../../../design/theme';
import { SEMANTIC_SIZES } from '../../../design/tokens';
import { DeviceFace } from '../../devices';
import { CHIP_METRICS, planChips } from '../group-layout';
import { listLabel, memberNoun, moreLabel } from '../group-summary';
import { bandButtons, bandButtonsWidth } from './band-width';
import type { GroupControls } from './use-group-controls';
import type { GroupData } from './use-group-data';

const CHIP_BOX = { width: CHIP_METRICS.width } as const;
const STRIP_GAP = { gap: CHIP_METRICS.gap } as const;

export function useControlHeight(): number {
  return SEMANTIC_SIZES[useIdiom()][useThemeSetting('density')].controlH;
}

export function ShowAll({
  label,
  hint,
  href,
}: {
  readonly label: string;
  readonly hint: string;
  readonly href: AppHref;
}): ReactNode {
  return <Button label={label} spoken={hint} variant="text" href={href} />;
}

export function MoreMembers({
  data,
  hidden,
}: {
  readonly data: GroupData;
  readonly hidden: number;
}): ReactNode {
  return hidden > 0 ? (
    <ShowAll
      label={`+${String(hidden)} more`}
      hint={`${moreLabel(hidden, memberNoun(data.lights))} in ${data.name}`}
      href={data.href}
    />
  ) : null;
}

export function DotPill({ data }: { readonly data: GroupData }): ReactNode {
  const dots: readonly Dot[] = data.members.map((member) => ({
    key: member.id,
    colour: data.view.colours[member.id] ?? null,
    state: data.view.powers[member.id] ?? 'unknown',
  }));
  return (
    <View className="self-start rounded-full bg-surface-1/70 px-2 py-1.5">
      <DotStrip dots={dots} />
    </View>
  );
}

export function BandRow({
  lead,
  children,
}: {
  readonly lead: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="mt-auto flex-row items-end gap-2" pointerEvents="box-none">
      <View className="min-w-0 flex-1" pointerEvents="box-none">
        {lead}
      </View>
      <ActionBand>{children}</ActionBand>
    </View>
  );
}

export function ChipStrip({
  data,
  shown,
}: {
  readonly data: GroupData;
  readonly shown: number;
}): ReactNode {
  return (
    <View
      role="group"
      aria-label={listLabel(memberNoun(data.lights), data.name)}
      className="min-h-touch-min flex-row items-center"
      style={STRIP_GAP}
    >
      {data.members.slice(0, shown).map((member) => (
        <View key={member.id} style={CHIP_BOX}>
          <DeviceFace deviceId={member.id} face="chip" context="nested" />
        </View>
      ))}
    </View>
  );
}

export function ChipBand({
  data,
  controls,
  width,
  notices,
}: {
  readonly data: GroupData;
  readonly controls: GroupControls;
  readonly width: number;
  readonly notices: ReactNode;
}): ReactNode {
  const buttons = bandButtons(data.lights, data.view.state);
  const plan = planChips(
    width - bandButtonsWidth(buttons, useControlHeight()),
    data.members.length,
  );
  const listed = notices === null;
  return (
    <BandRow lead={listed ? <ChipStrip data={data} shown={plan.shown} /> : notices}>
      {listed ? <MoreMembers data={data} hidden={plan.hidden} /> : null}
      {controls.colour}
      {controls.power}
    </BandRow>
  );
}
