import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AiHarnessSession } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { ReasonLine } from '../../../components/reason-line';
import { List } from '../../../components/section';
import { useChatHarness, useHarnessCatalogue } from '../data/harness';
import { harnessHostName, harnessRouteLabel } from '../model/harness-context';
import { useDetailsClose } from './details-scope';
import { HARNESS_FAILURE_ACTION_LABEL } from './harness-failure';
import { LoadFailed, RowsSkeleton } from './section-state';
import { useFailureHandlers, useHarnessFailure } from './use-harness-failure';
import { background } from '@smarteverything/logging';

const STATE_LABEL: Readonly<Record<AiHarnessSession['state'], string>> = {
  idle: 'Ready',
  working: 'Working',
  waiting: 'Waiting',
  switching: 'Switching machine',
  unavailable: 'Unavailable',
  failed: 'Failed',
};

function FailureLine({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const failure = useHarnessFailure(chat);
  const handlerOf = useFailureHandlers(chat, useDetailsClose());
  if (failure === null) return null;
  const action = failure.action === null ? null : handlerOf(failure.action);
  return (
    <View className="px-4">
      <ReasonLine
        icon="alert"
        tone="critical"
        text={failure.body === null ? failure.title : `${failure.title}. ${failure.body}`}
        {...(failure.action === null || action === null
          ? {}
          : { action: { label: HARNESS_FAILURE_ACTION_LABEL[failure.action], onPress: action } })}
      />
    </View>
  );
}

function SessionRows({ session }: { readonly session: AiHarnessSession }): ReactNode {
  const catalogue = useHarnessCatalogue().data;
  const route = catalogue?.routes.find((item) => item.id === session.route.route_id);
  const model =
    route?.models.find((item) => item.id === session.route.model)?.name ?? session.route.model;
  return (
    <List title="Work">
      {[
        <ListRow
          key="host"
          title="Host"
          value={`${harnessHostName(session.target, catalogue)} · ${STATE_LABEL[session.state]}`}
        />,
        <ListRow key="model" title="Model" value={model} />,
        <ListRow
          key="supplier"
          title="Supplier"
          value={route === undefined ? 'Unavailable' : harnessRouteLabel(route, catalogue)}
        />,
        session.directory === null ? null : (
          <ListRow
            key="workspace"
            title="Workspace"
            subtitle={session.directory.path}
            wrapSubtitle
          />
        ),
        ...session.work.map((work) => (
          <ListRow key={`${work.kind}:${work.id}`} title={work.kind} value={work.reason} />
        )),
      ]}
    </List>
  );
}

export function WorkGroup({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const engine = chat.engine;
  const session = useChatHarness(chat.id, engine.kind === 'dsh' && engine.session_id !== null);
  if (engine.kind !== 'dsh') return null;
  if (engine.session_id === null) {
    return (
      <List title="Work">
        <ListRow icon="info" title="No session yet" subtitle="Send a message to start." />
      </List>
    );
  }
  if (session.error !== null) {
    return (
      <LoadFailed
        what="work status"
        retry={() => {
          background(session.refetch(), 'session.refetch_failed');
        }}
      />
    );
  }
  if (session.data === undefined) return <RowsSkeleton />;
  return (
    <>
      <FailureLine chat={chat} />
      <SessionRows session={session.data} />
    </>
  );
}
