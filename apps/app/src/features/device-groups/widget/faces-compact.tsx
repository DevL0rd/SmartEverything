import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { groupSummary, memberNoun, spreadText } from '../group-summary';
import { LevelBand } from './master-band';
import { GroupGlyph, GroupTitle } from './group-header';
import { Notices } from './notices';
import { BandRow, ChipBand, DotPill } from './member-parts';
import type { GroupControls } from './use-group-controls';
import { hasIssues } from '../model/outcomes';
import type { GroupData } from './use-group-data';

interface FaceProps {
  readonly data: GroupData;
  readonly controls: GroupControls;
}

function FillBand({
  data,
  children,
}: {
  readonly data: GroupData;
  readonly children: ReactNode;
}): ReactNode {
  const { state, colours } = data.view;
  return (
    <LevelBand
      state={state}
      colours={colours}
      master={data.master}
      name={data.name}
      lights={data.lights}
      noun={memberNoun(data.lights)}
      shape="fill"
    >
      <View className="h-full flex-1" pointerEvents="box-none">
        {children}
      </View>
    </LevelBand>
  );
}

export function SmallFace({ data, controls }: FaceProps): ReactNode {
  const on = data.view.state.on > 0;
  return (
    <FillBand data={data}>
      <View className="flex-1 gap-1.5 p-card-pad" pointerEvents="box-none">
        <View className="flex-row items-start gap-2" pointerEvents="box-none">
          <GroupGlyph on={on} lights={data.lights} />
          <Interactive
            href={data.href}
            label={`${data.name}, ${groupSummary(data.view.state).text}`}
            className="min-w-0 flex-1 rounded-xs"
            layerClassName="rounded-xs"
          >
            <GroupTitle name={data.name} state={data.view.state} lines={2} strong />
          </Interactive>
        </View>
        <BandRow lead={<DotPill data={data} />}>{controls.power}</BandRow>
      </View>
    </FillBand>
  );
}

export function TightFace({ data, controls }: FaceProps): ReactNode {
  const on = data.view.state.on > 0;
  return (
    <FillBand data={data}>
      <View className="flex-1 gap-1.5 p-card-pad" pointerEvents="box-none">
        <View className="flex-row items-start gap-2">
          <GroupGlyph on={on} lights={data.lights} />
          <GroupTitle name={data.name} state={data.view.state} lines={2} strong />
        </View>
        <BandRow lead={<DotPill data={data} />}>{controls.power}</BandRow>
      </View>
    </FillBand>
  );
}

export function StripFace({
  data,
  controls,
  width,
}: FaceProps & { readonly width: number }): ReactNode {
  const { state } = data.view;
  const on = state.on > 0;
  return (
    <FillBand data={data}>
      <View className="flex-1 gap-1.5 p-card-pad" pointerEvents="box-none">
        <View className="flex-row items-center gap-2">
          <GroupGlyph on={on} lights={data.lights} />
          <GroupTitle name={data.name} state={state} strong />
          {state.power === 'none' ? null : (
            <Text variant="callout" className="tabular">
              {spreadText(state.level, ' %')}
            </Text>
          )}
        </View>
        <ChipBand
          data={data}
          controls={controls}
          width={width}
          notices={
            state.power === 'none' || hasIssues(data.master.outcomes) || data.lost > 0 ? (
              <Notices data={data} />
            ) : null
          }
        />
      </View>
    </FillBand>
  );
}
