import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DeviceFace } from '../../devices';
import { listLabel, memberNoun } from '../group-summary';
import { planChipGrid } from '../group-layout';
import { GroupGlyph, GroupTitle } from './group-header';
import { LevelBand } from './master-band';
import { BAND_GAP, moreFreed } from './band-width';
import { ChipBand, MoreMembers, useControlHeight } from './member-parts';
import { ActionBand } from '../../../components/widget-board/action-band';
import { Notices } from './notices';
import type { GroupControls } from './use-group-controls';
import { hasIssues } from '../model/outcomes';
import type { GroupData } from './use-group-data';

interface FaceProps {
  readonly data: GroupData;
  readonly controls: GroupControls;
}

function Header({ data }: { readonly data: GroupData }): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <GroupGlyph on={data.view.state.on > 0} lights={data.lights} />
      <GroupTitle name={data.name} state={data.view.state} strong />
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
    <View className="flex-1 gap-1">
      <Header data={data} />
      <Band data={data} />
      <ChipBand
        data={data}
        controls={controls}
        width={width}
        notices={hasNotice(data) ? <Notices data={data} /> : null}
      />
    </View>
  );
}

export function WideFace({
  data,
  controls,
  width,
  height,
}: FaceProps & { readonly width: number; readonly height: number }): ReactNode {
  const controlH = useControlHeight();
  const grid = planChipGrid(width, height - controlH - BAND_GAP, data.members.length);
  const plan = moreFreed(grid);
  const leftZone = { width: grid.leftWidth };
  const chipBox = { width: grid.chipWidth };
  return (
    <View className="flex-1 flex-row gap-4">
      <View className="gap-1.5" style={leftZone}>
        <Header data={data} />
        <Band data={data} />
        <Notices data={data} />
      </View>
      <View className="min-w-0 flex-1" pointerEvents="box-none">
        <View
          role="group"
          aria-label={listLabel(memberNoun(data.lights), data.name)}
          className="flex-row flex-wrap gap-2"
        >
          {data.members.slice(0, plan.shown).map((member) => (
            <View key={member.id} style={chipBox}>
              <DeviceFace deviceId={member.id} face="chip" context="nested" />
            </View>
          ))}
        </View>
        <ActionBand>
          <MoreMembers data={data} hidden={plan.hidden} />
          {controls.colour}
          {controls.power}
        </ActionBand>
      </View>
    </View>
  );
}
