import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { ListeningView } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { useAreaWidth } from '../../../design/size-class';
import { useIsOwner } from '../../../store/selectors';
import { useAssistantName } from '../data/assistant-data';
import { ContestCard } from './contest-card';
import { EarHostCard } from './ear-host-card';
import { ListeningHero } from './listening-hero';
import { groupsOf, rowsOf, type ListeningRow } from './listening-model';
import { PauseCard } from './pause-card';
import { DefaultsCard, PrecedenceCard } from './precedence-cards';
import { SourceGroup } from './source-group';
import { SourceSheet } from './source-sheet';
import { useListeningActions, type ListeningActions } from './use-listening-actions';

const TWO_COLUMNS_FROM = 960;

function Empty(): ReactNode {
  return (
    <EmptyState
      icon="mic"
      title="Nothing is listening yet"
      body="Phones and computers show up here once they join your home. Cameras show up once the AI may talk through them."
      action={
        <Button
          label="Open Reaching you"
          variant="text"
          href={href.settings.page('assistant/reach')}
        />
      }
    />
  );
}

function Sources({
  rows,
  actions,
}: {
  readonly rows: readonly ListeningRow[];
  readonly actions: ListeningActions;
}): ReactNode {
  const groups = groupsOf(rows);
  if (groups.length === 0) return <Empty />;
  return (
    <View className="gap-5">
      {groups.map((group) => (
        <SourceGroup key={group.kind} group={group} actions={actions.rows} onAll={actions.onAll} />
      ))}
    </View>
  );
}

function Rules({
  view,
  call,
  offline,
}: {
  readonly view: ListeningView;
  readonly call: boolean;
  readonly offline: boolean;
}): ReactNode {
  const owner = useIsOwner();
  return (
    <View className="gap-5 medium:flex-row medium:items-start">
      <View className="medium:flex-1">
        <PrecedenceCard call={call} />
      </View>
      {owner ? (
        <View className="gap-5 medium:flex-1">
          <EarHostCard view={view} offline={offline} />
          <PauseCard offline={offline} />
          <DefaultsCard />
        </View>
      ) : null}
    </View>
  );
}

function SideColumn({
  view,
  call,
  offline,
}: {
  readonly view: ListeningView;
  readonly call: boolean;
  readonly offline: boolean;
}): ReactNode {
  const owner = useIsOwner();
  const name = useAssistantName();
  return (
    <View className="w-90 gap-5">
      <ContestCard last={view.last} sources={view.sources} name={name} offline={offline} />
      <PrecedenceCard call={call} />
      {owner ? <EarHostCard view={view} offline={offline} /> : null}
      {owner ? <PauseCard offline={offline} /> : null}
      {owner ? <DefaultsCard /> : null}
    </View>
  );
}

function Layout({
  view,
  rows,
  actions,
  offline,
}: {
  readonly view: ListeningView;
  readonly rows: readonly ListeningRow[];
  readonly actions: ListeningActions;
  readonly offline: boolean;
}): ReactNode {
  const name = useAssistantName();
  const call = rows.some((row) => row.state === 'discord_call');
  if (useAreaWidth() >= TWO_COLUMNS_FROM) {
    return (
      <View className="flex-row items-start gap-7">
        <View className="min-w-0 flex-1">
          <Sources rows={rows} actions={actions} />
        </View>
        <SideColumn view={view} call={call} offline={offline} />
      </View>
    );
  }
  return (
    <>
      <ContestCard last={view.last} sources={view.sources} name={name} offline={offline} />
      <Sources rows={rows} actions={actions} />
      <Rules view={view} call={call} offline={offline} />
    </>
  );
}

export function ListeningBody({
  view,
  allowed,
  offline,
}: {
  readonly view: ListeningView;
  readonly allowed: ReadonlySet<string> | null;
  readonly offline: boolean;
}): ReactNode {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const name = useAssistantName();
  const rows = rowsOf(view, allowed);
  const actions = useListeningActions(offline, setOpenKey);
  const open = rows.find((row) => row.source.key === openKey);
  return (
    <View className="gap-5">
      <ListeningHero rows={rows} offline={offline} />
      <Layout view={view} rows={rows} actions={actions} offline={offline} />
      {open === undefined ? null : (
        <SourceSheet
          row={open}
          offline={offline}
          name={name}
          onClose={() => {
            setOpenKey(null);
          }}
          onChange={actions.onSheet}
        />
      )}
    </View>
  );
}
