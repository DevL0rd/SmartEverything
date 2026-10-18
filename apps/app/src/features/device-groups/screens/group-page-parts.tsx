import type { ReactElement, ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import type { DeviceGroupRow, MemberOutcome } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { bringIntoView } from '../../../components/bring-into-view';
import { PageHeader } from '../../../components/page-header';
import { useScreen } from '../../../components/screen-context';
import { Section } from '../../../components/section';
import { plural } from '../../../format/text';
import { useDevices } from '../../../store/selectors';
import { deviceModelOf } from '../../devices';
import { GlowStage } from '../components/glow-stage';
import { MasterControls } from '../components/master-controls';
import { SharedControls } from '../components/shared-controls';
import { TodayLanes } from '../components/today-lanes';
import { useTargetHistory } from '../data/use-target-history';
import { GroupEditor } from '../group-editor';
import { memberNoun, pageSummary } from '../group-summary';
import { outcomeMarks } from '../model/outcomes';
import type { GroupPageParams } from '../model/route-params';
import { stageMembers, washColour, type StageMember } from '../model/stage';
import { ColourSheet } from '../widget/colour-sheet';
import { ResultLine } from '../widget/result-line';
import type { GroupData } from '../widget/use-group-data';
import { pageMenu, powerAction, type AddToHome } from './group-menu';
import type { GroupPageState } from './use-group-page';
import type { EditorResult } from '../data/use-group-draft';
import type { AutomationUse } from '../model/automation-uses';

export interface PageProps {
  readonly data: GroupData;
  readonly group: DeviceGroupRow | null;
  readonly params: GroupPageParams;
  readonly onEdited: (result: EditorResult) => void;
  readonly addToHome: AddToHome;
}

function useFocusStage(focus: string | null): ReturnType<typeof useAnimatedRef<Animated.View>> {
  const ref = useAnimatedRef<Animated.View>();
  const { scrollRef, scrollY } = useScreen();
  useEffect(() => {
    if (focus === null || scrollRef === null) return undefined;
    const frame = requestAnimationFrame(() => {
      scheduleOnUI(bringIntoView, ref, scrollRef, scrollY);
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [focus, ref, scrollRef, scrollY]);
  return ref;
}

function useStageMembers(data: GroupData): readonly StageMember[] {
  const marks = useMemo(() => outcomeMarks(data.master.outcomes), [data.master.outcomes]);
  return useMemo(
    () =>
      stageMembers(
        data.members.map((member) => ({
          id: member.id,
          label: member.label,
          light: deviceModelOf(member).family === 'light',
        })),
        data.view,
        marks,
      ),
    [data.members, data.view, marks],
  );
}

export interface LivePageProps extends PageProps {
  readonly page: GroupPageState;
  readonly uses: readonly AutomationUse[];
}

export function failedOrWaiting(
  outcomes: readonly MemberOutcome[],
): ReadonlyMap<string, MemberOutcome> {
  return new Map(
    outcomes.flatMap((outcome) =>
      outcome.status === 'failed' || outcome.status === 'pending'
        ? [[outcome.deviceId, outcome] as const]
        : [],
    ),
  );
}

export function Stage({
  data,
  page,
  focus,
}: {
  readonly data: GroupData;
  readonly page: GroupPageState;
  readonly focus: string | null;
}): ReactNode {
  const ref = useFocusStage(focus);
  const members = useStageMembers(data);
  const noun = memberNoun(data.lights);
  return (
    <Animated.View ref={ref} collapsable={false} className="gap-3">
      <GlowStage
        name={data.name}
        noun={noun}
        state={data.view.state}
        members={members}
        wash={washColour(data.view.colours, data.view.state)}
        onPick={page.pick}
      >
        <MasterControls
          data={data}
          focus={focus}
          onMore={() => {
            page.setColourOpen(true);
          }}
        />
      </GlowStage>
      <ResultLine
        outcomes={data.master.outcomes}
        noun={noun}
        nameOf={data.nameOf}
        onRetry={data.master.retry}
        onDismiss={data.master.dismiss}
      />
      {data.lights ? null : <SharedControls target={data.target} members={data.members} />}
    </Animated.View>
  );
}

export function LostBanner({
  data,
  group,
  page,
}: {
  readonly data: GroupData;
  readonly group: DeviceGroupRow | null;
  readonly page: GroupPageState;
}): ReactNode {
  if (data.lost === 0) return null;
  const noun = memberNoun(data.lights);
  return (
    <Banner
      tone="info"
      title={`${plural(data.lost, noun)} ${data.lost === 1 ? 'was' : 'were'} removed from this group`}
      {...(group === null
        ? {}
        : {
            action: {
              label: 'Edit group',
              onPress: (): void => {
                page.setEditing(true);
              },
            },
          })}
    />
  );
}

export function Today({
  data,
  page,
}: {
  readonly data: GroupData;
  readonly page: GroupPageState;
}): ReactNode {
  const history = useTargetHistory(data.members, page.span, data.view.powers);
  return (
    <Section title={page.span === 'day' ? 'Today' : 'This week'}>
      <TodayLanes
        members={data.members}
        history={history}
        colours={data.view.resting}
        powers={data.view.powers}
        span={page.span}
        onSpan={page.setSpan}
        noun={memberNoun(data.lights)}
      />
    </Section>
  );
}

export function Overlays({
  data,
  group,
  page,
  uses,
  onEdited,
}: PageProps & {
  readonly page: GroupPageState;
  readonly uses: readonly string[];
}): ReactNode {
  const devices = useDevices({ includeHidden: true });
  return (
    <>
      {page.colourOpen ? (
        <ColourSheet
          name={data.name}
          noun={memberNoun(data.lights)}
          state={data.view.state}
          master={data.master}
          onClose={() => {
            page.setColourOpen(false);
          }}
        />
      ) : null}
      {page.editing && group !== null ? (
        <GroupEditor
          group={group}
          devices={devices}
          automations={uses}
          onClose={(result) => {
            page.setEditing(false);
            onEdited(result);
          }}
        />
      ) : null}
    </>
  );
}

export function Header({
  data,
  group,
  uses,
  page,
  addToHome,
}: {
  readonly data: GroupData;
  readonly group: DeviceGroupRow | null;
  readonly uses: readonly string[];
  readonly page: GroupPageState;
  readonly addToHome: AddToHome;
}): ReactElement {
  const noun = memberNoun(data.lights);
  const menu = pageMenu({
    target: data.target,
    group,
    uses,
    onEdit: () => {
      page.setEditing(true);
    },
    addToHome,
  });
  return (
    <PageHeader
      title={data.name}
      titleLines={2}
      subtitle={pageSummary(data.view.state, noun)}
      back
      actions={powerAction(data, noun)}
      overflow={menu}
    />
  );
}
