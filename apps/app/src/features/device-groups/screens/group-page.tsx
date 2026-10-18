import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View } from 'react-native';
import type { DeviceGroupRow } from '@smarteverything/domain';
import { Screen } from '../../../components/screen';
import { Section, SectionAction } from '../../../components/section';
import { useSizeClass } from '../../../design/size-class';
import { MemberRows } from '../components/member-rows';
import { ActivitySection, AutomationsSection } from '../components/page-sections';
import { useAutomationUses } from '../data/use-automation-uses';
import { isVirtual } from '../model/member-rows';
import type { GroupData } from '../widget/use-group-data';
import {
  Header,
  LostBanner,
  Overlays,
  Stage,
  Today,
  failedOrWaiting,
  type LivePageProps,
  type PageProps,
} from './group-page-parts';
import { useGroupPage, type GroupPageState } from './use-group-page';
import { VirtualGroupPage } from './virtual-group-page';

function Members({
  data,
  group,
  page,
}: {
  readonly data: GroupData;
  readonly group: DeviceGroupRow | null;
  readonly page: GroupPageState;
}): ReactNode {
  return (
    <Section
      title={`${data.lights ? 'Lights' : 'Devices'} · ${String(data.members.length)}`}
      action={
        group === null ? undefined : (
          <SectionAction
            label="Edit"
            onPress={() => {
              page.setEditing(true);
            }}
          />
        )
      }
    >
      <LostBanner data={data} group={group} page={page} />
      <MemberRows
        members={data.members}
        expanded={page.expanded}
        reveal={page.reveal}
        outcomes={failedOrWaiting(data.master.outcomes)}
        onToggle={page.toggle}
      />
    </Section>
  );
}

function Layout({
  wide,
  stage,
  members,
  today,
  activity,
  automations,
}: {
  readonly wide: boolean;
  readonly stage: ReactNode;
  readonly members: ReactNode;
  readonly today: ReactNode;
  readonly activity: ReactNode;
  readonly automations: ReactNode;
}): ReactNode {
  if (!wide)
    return (
      <View className="gap-4">
        {stage}
        {members}
        {today}
        {activity}
        {automations}
      </View>
    );
  return (
    <View className="flex-row items-start gap-6">
      <View className="max-w-xl flex-1 gap-4">
        {stage}
        {today}
      </View>
      <View className="min-w-0 flex-1 gap-4">
        {members}
        {automations}
        {activity}
      </View>
    </View>
  );
}

function ScrollGroupPage(props: LivePageProps): ReactNode {
  const { data, group, params, page, uses, addToHome } = props;
  const wide = ['expanded', 'large', 'xlarge'].includes(useSizeClass().width);
  const names = useMemo(() => uses.map((use) => use.name), [uses]);
  const memberIds = useMemo(() => data.members.map((member) => member.id), [data.members]);
  return (
    <Screen
      header={<Header data={data} group={group} uses={names} page={page} addToHome={addToHome} />}
    >
      <Layout
        wide={wide}
        stage={<Stage data={data} page={page} focus={params.focus} />}
        members={<Members data={data} group={group} page={page} />}
        today={<Today data={data} page={page} />}
        activity={<ActivitySection name={data.name} deviceIds={memberIds} />}
        automations={<AutomationsSection uses={uses} />}
      />
      <Overlays {...props} page={page} uses={names} />
    </Screen>
  );
}

export function GroupPage(props: PageProps): ReactNode {
  const { data, group, params } = props;
  const page = useGroupPage(params, group !== null);
  const uses = useAutomationUses(data.target);
  return isVirtual(data.members.length) ? (
    <VirtualGroupPage {...props} page={page} uses={uses} />
  ) : (
    <ScrollGroupPage {...props} page={page} uses={uses} />
  );
}
