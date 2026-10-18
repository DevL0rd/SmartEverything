import type { ReactNode, RefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Screen } from '../../../components/screen';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { VirtualList, type VirtualListHandle } from '../../../components/virtual-list';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { useThemeSetting } from '../../../design/theme';
import { CONTAINER_WIDTH, GUTTER, SEMANTIC_SIZES } from '../../../design/tokens';
import type { Device } from '../../../store/state';
import { VirtualMemberRow } from '../components/virtual-member-rows';
import { ActivitySection, AutomationsSection } from '../components/page-sections';
import { columnsFor, groupKeyOf, rowGroups, sameGroup, type RowGroup } from '../model/member-rows';
import {
  Header,
  LostBanner,
  Overlays,
  Stage,
  Today,
  failedOrWaiting,
  type LivePageProps,
} from './group-page-parts';

function useContentWidth(measured: number): number {
  const sizes = SEMANTIC_SIZES[useIdiom()][useThemeSetting('density')];
  const gutter = GUTTER[useSizeClass().width] - sizes.gutterShrink;
  return Math.min(measured - 2 * gutter, CONTAINER_WIDTH.dashboard);
}

function useRevealRow(
  groups: readonly RowGroup<Device>[],
  reveal: LivePageProps['page']['reveal'],
): RefObject<VirtualListHandle | null> {
  const handle = useRef<VirtualListHandle>(null);
  const revealId = reveal?.id ?? null;
  const nonce = reveal?.nonce ?? 0;
  const key = revealId === null ? null : groupKeyOf(groups, revealId);
  useEffect(() => {
    if (key === null || nonce === 0) return undefined;
    const frame = requestAnimationFrame(() => {
      handle.current?.scrollToItem(key);
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [key, nonce]);
  return handle;
}

function ListTop({
  data,
  group,
  page,
  focus,
}: Pick<LivePageProps, 'data' | 'group' | 'page'> & {
  readonly focus: string | null;
}): ReactNode {
  return (
    <View className="px-gutter">
      <View className="w-full max-w-dashboard gap-4 self-center pb-2">
        <View className="max-w-xl">
          <Stage data={data} page={page} focus={focus} />
        </View>
        <LostBanner data={data} group={group} page={page} />
      </View>
    </View>
  );
}

function ListBottom({
  data,
  page,
  uses,
}: Pick<LivePageProps, 'data' | 'page' | 'uses'>): ReactNode {
  const memberIds = useMemo(() => data.members.map((member) => member.id), [data.members]);
  return (
    <View className="px-gutter">
      <View className="w-full max-w-dashboard gap-4 self-center pt-4">
        <Today data={data} page={page} />
        <ActivitySection name={data.name} deviceIds={memberIds} />
        <AutomationsSection uses={uses} />
      </View>
    </View>
  );
}

function Rows({
  data,
  group,
  page,
  uses,
  focus,
  width,
}: Pick<LivePageProps, 'data' | 'group' | 'page' | 'uses'> & {
  readonly focus: string | null;
  readonly width: number;
}): ReactNode {
  const columns = columnsFor(useContentWidth(width));
  const groups = useMemo(() => rowGroups(data.members, columns), [data.members, columns]);
  const sections = useMemo(
    () => [
      {
        key: 'members',
        title: `${data.lights ? 'Lights' : 'Devices'} · ${String(data.members.length)}`,
        data: groups,
      },
    ],
    [data.lights, data.members.length, groups],
  );
  const outcomes = failedOrWaiting(data.master.outcomes);
  const handle = useRevealRow(groups, page.reveal);
  return (
    <VirtualList
      sections={sections}
      keyOf={(row) => row.key}
      typeOf={() => 'members'}
      sameItem={sameGroup}
      widthClassName="max-w-dashboard"
      handleRef={handle}
      header={<ListTop data={data} group={group} page={page} focus={focus} />}
      footer={<ListBottom data={data} page={page} uses={uses} />}
      renderItem={(row) => (
        <VirtualMemberRow
          group={row}
          columns={columns}
          expanded={page.expanded}
          outcomes={outcomes}
          onToggle={page.toggle}
        />
      )}
    />
  );
}

export function VirtualGroupPage(props: LivePageProps): ReactNode {
  const { data, group, page, uses, addToHome, params } = props;
  const names = useMemo(() => uses.map((use) => use.name), [uses]);
  const screenWidth = useWindowDimensions().width;
  const { width, onLayout } = useMeasuredWidth(
    Math.round,
    useIdiom() === 'touch' ? Math.round(screenWidth) : 0,
  );
  return (
    <Screen
      scroll={false}
      maxWidth="dashboard"
      header={<Header data={data} group={group} uses={names} page={page} addToHome={addToHome} />}
    >
      <View className="flex-1" onLayout={onLayout}>
        {width === 0 ? null : (
          <Rows
            data={data}
            group={group}
            page={page}
            uses={uses}
            focus={params.focus}
            width={width}
          />
        )}
      </View>
      <Overlays {...props} page={page} uses={names} />
    </Screen>
  );
}
