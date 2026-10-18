import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DeviceFace } from '../../devices';
import { listLabel, memberNoun, moreLabel } from '../group-summary';
import { planChipGrid } from '../group-layout';
import { GroupGlyph, GroupTitle } from './group-header';
import { LevelBand } from './master-band';
import { ChipStrip, ShowAll } from './member-parts';
import { Notices } from './notices';
import type { GroupControls } from './use-group-controls';
import { hasIssues } from '../model/outcomes';
import type { GroupData } from './use-group-data';

interface FaceProps {
  readonly data: GroupData;
  readonly controls: GroupControls;
}

function Header({ data, controls }: FaceProps): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <GroupGlyph on={data.view.state.on > 0} lights={data.lights} />
      <GroupTitle name={data.name} state={data.view.state} strong />
      {controls.colour}
      {controls.power}
    </View>
  );
}

function Band({ data }: { readonly data: GroupData }): ReactNode {
  return (
    <LevelBand
      state={data.view.state}
      colours={data.view.colours}
      master={data.master}
      name={data.name}
      lights={data.lights}
      noun={memberNoun(data.lights)}
    />
  );
}

function hasNotice(data: GroupData): boolean {
  return data.view.state.power === 'none' || hasIssues(data.master.outcomes) || data.lost > 0;
}

export function MediumFace({
  data,
  controls,
  width,
}: FaceProps & { readonly width: number }): ReactNode {
  return (
    <View className="flex-1 gap-1.5">
      <Header data={data} controls={controls} />
      <Band data={data} />
      {hasNotice(data) ? <Notices data={data} /> : <ChipStrip data={data} width={width} />}
    </View>
  );
}

export function WideFace({
  data,
  controls,
  width,
  height,
}: FaceProps & { readonly width: number; readonly height: number }): ReactNode {
  const plan = planChipGrid(width, height, data.members.length);
  const shown = data.members.slice(0, plan.shown);
  const noun = memberNoun(data.lights);
  const leftZone = { width: plan.leftWidth };
  const chipBox = { width: plan.chipWidth };
  return (
    <View className="flex-1 flex-row gap-4">
      <View className="justify-center gap-1.5" style={leftZone}>
        <Header data={data} controls={controls} />
        <Band data={data} />
        <Notices data={data} />
      </View>
      <View
        role="group"
        aria-label={listLabel(noun, data.name)}
        className="min-w-0 flex-1 flex-row flex-wrap content-center gap-2"
      >
        {shown.map((member) => (
          <View key={member.id} style={chipBox}>
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
    </View>
  );
}
