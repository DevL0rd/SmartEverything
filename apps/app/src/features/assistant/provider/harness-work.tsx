import { CHAT_ERROR_MESSAGE } from '../model/turn-notice';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AiHarnessSession } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useChatHarness, useHarnessCatalogue, useHarnessSupportReason } from '../data/harness';
import { harnessHostName, harnessRouteLabel } from '../model/harness-context';
import { QueryState } from '../../computers/components/query-state';
import { HarnessHandoffStatus } from './harness-handoff';
import { HarnessInteraction } from './harness-interactions';
import { Segmented } from '../../../components/segmented';
import { HarnessSessionPermission } from './harness-session-permission';
import type { WorkTab } from './work-tabs';

function HarnessWorkBody({
  chat,
  initial,
}: {
  readonly chat: AiChatRow;
  readonly initial: WorkTab;
}): ReactNode {
  const state = useChatHarness(
    chat.id,
    chat.engine.kind === 'dsh' && chat.engine.session_id !== null,
  );
  const supportReason = useHarnessSupportReason();
  if (supportReason !== null) return <Text tone="variant">{supportReason}</Text>;
  if (chat.engine.kind !== 'dsh') return null;
  if (chat.engine.session_id === null)
    return (
      <Text tone="variant">
        No native session has opened. Send a message after the selected host and model supplier
        report ready.
      </Text>
    );
  return (
    <View className="gap-section-gap">
      <QueryState
        pending={state.isPending}
        error={state.error}
        retry={() => {
          void state.refetch();
        }}
      />
      {state.data === undefined ? null : (
        <HarnessSessionDetails session={state.data} initial={initial} />
      )}
    </View>
  );
}
export function HarnessWorkSheet({
  chat,
  open,
  onClose,
  initial = 'overview',
}: {
  readonly initial?: WorkTab;
  readonly chat: AiChatRow;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="Work" detents={['full']}>
      {open ? <HarnessWorkBody chat={chat} initial={initial} /> : null}
    </Sheet>
  );
}
export function HarnessWorkButton({
  chat,
  label = 'Work',
}: {
  readonly chat: AiChatRow;
  readonly label?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        label={label}
        variant="text"
        onPress={() => {
          setOpen(true);
        }}
      />
      <HarnessWorkSheet
        chat={chat}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}
export function HarnessExecutionContext({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const session = useChatHarness(
    chat.id,
    chat.engine.kind === 'dsh' && chat.engine.session_id !== null,
  );
  return session.data === undefined ? null : <HarnessHandoffStatus session={session.data} />;
}

function HarnessSessionDetails({
  session,
  initial,
}: {
  readonly session: AiHarnessSession;
  readonly initial: WorkTab;
}): ReactNode {
  const [section, setSection] = useState(harnessSection(initial));
  return (
    <View className="gap-section-gap">
      <Segmented
        label="Work settings"
        value={section}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'permissions', label: 'Permissions' },
          { value: 'questions', label: 'Questions' },
        ]}
        onChange={setSection}
      />
      {session.failure === null ? null : (
        <Text selectable tone="critical">
          {CHAT_ERROR_MESSAGE}
        </Text>
      )}
      <HarnessWorkSection section={section} session={session} />
    </View>
  );
}

function HarnessWorkSection({
  section,
  session,
}: {
  readonly section: string;
  readonly session: AiHarnessSession;
}): ReactNode {
  switch (section) {
    case 'overview':
      return <HarnessOverview session={session} />;
    case 'permissions':
      return <HarnessSessionPermission session={session} />;
    default:
      return session.interactions.length === 0 ? (
        <Text tone="variant">No questions or approvals are waiting.</Text>
      ) : (
        <>
          {session.interactions.map((interaction) => (
            <HarnessInteraction
              key={`${interaction.id}:${String(interaction.epoch)}`}
              chatId={session.chat_id}
              interaction={interaction}
            />
          ))}
        </>
      );
  }
}

function HarnessOverview({ session }: { readonly session: AiHarnessSession }): ReactNode {
  const catalogue = useHarnessCatalogue();
  const route = catalogue.data?.routes.find((item) => item.id === session.route.route_id);
  return (
    <List title="Current work">
      <ValueRow title="Host" value={harnessHostName(session.target, catalogue.data)} />
      <ValueRow title="Status" value={session.state} />
      <ValueRow
        title="Model"
        value={
          route?.models.find((model) => model.id === session.route.model)?.name ??
          session.route.model
        }
      />
      <ValueRow
        title="Supplier"
        value={route === undefined ? 'Unavailable' : harnessRouteLabel(route, catalogue.data)}
      />
      {session.directory === null ? null : (
        <ValueRow title="Workspace" value={session.directory.path} wrapSubtitle />
      )}
      {session.work.map((work) => (
        <ValueRow key={`${work.kind}:${work.id}`} title={work.kind} value={work.reason} />
      ))}
    </List>
  );
}

function harnessSection(initial: WorkTab): string {
  switch (initial) {
    case 'settings':
      return 'permissions';
    case 'prompts':
      return 'questions';
    case 'control':
      return 'overview';
    case 'overview':
    case 'events':
    case 'mcp':
    case 'read':
      return 'overview';
  }
}
