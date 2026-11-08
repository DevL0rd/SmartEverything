import { useState, type ReactNode } from 'react';
import type { AiRepairPage } from '@smarteverything/domain';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../components/disclosure';
import { Interactive } from '../../../components/interactive';
import { List, Section, SectionAction } from '../../../components/section';
import { Text } from '../../../components/text';
import {
  useAiRepairGroups,
  useDiagnosisRequests,
  useDismissAiRepairGroups,
  useRefreshAiRepairGroups,
} from '../data/ai-repair-inbox';
import { AUTOMATIC_HOLD } from '../model/ai-repair-copy';
import { AiRepairErrorGroup } from './ai-repair-group';

type Cursor = AiRepairPage['next'];

const INBOX_FOCUS = 'developer.error-investigations';

function InboxNotice({
  failed,
  loading,
  older,
}: {
  readonly failed: boolean;
  readonly loading: boolean;
  readonly older: boolean;
}): ReactNode {
  let message = older ? 'No errors on this page.' : 'Your inbox is clear.';
  if (loading) message = 'Loading errors…';
  if (failed) message = 'Couldn’t load errors. Try refreshing.';
  return (
    <Card>
      <Text
        variant="callout"
        tone={failed ? 'warning' : 'variant'}
        accessibilityLiveRegion="polite"
      >
        {message}
      </Text>
    </Card>
  );
}

function DismissalStatus({
  dismissal,
}: {
  readonly dismissal: ReturnType<typeof useDismissAiRepairGroups>;
}): ReactNode {
  if (dismissal.isError) {
    return (
      <Text variant="footnote" tone="critical" className="px-4" accessibilityLiveRegion="polite">
        Couldn’t update the inbox. Try again.
      </Text>
    );
  }
  if (dismissal.data?.dismissed !== 0) return null;
  return (
    <Text variant="footnote" tone="variant" className="px-4" accessibilityLiveRegion="polite">
      {dismissal.variables?.kind === 'inactive'
        ? 'There are no inactive groups to clear.'
        : 'This dismissal no longer applies.'}
    </Text>
  );
}

function ErrorGroupList({
  query,
  dismissal,
  diagnosisFor,
  older,
}: {
  readonly query: ReturnType<typeof useAiRepairGroups>;
  readonly dismissal: ReturnType<typeof useDismissAiRepairGroups>;
  readonly diagnosisFor: ReturnType<typeof useDiagnosisRequests>;
  readonly older: boolean;
}): ReactNode {
  const rows = query.data?.groups ?? [];
  const hold = query.data?.automaticHold;
  return (
    <>
      {hold === undefined || rows.length === 0 ? null : (
        <Text variant="footnote" tone="variant" className="px-4">
          {AUTOMATIC_HOLD[hold]}
        </Text>
      )}
      {rows.length === 0 || query.isError ? (
        <InboxNotice failed={query.isError} loading={query.isPending} older={older} />
      ) : null}
      <DismissalStatus dismissal={dismissal} />
      {rows.length === 0 ? null : (
        <List>
          {rows.map((group) => (
            <AiRepairErrorGroup
              key={group.fingerprint}
              group={group}
              diagnosis={diagnosisFor(group.fingerprint)}
              dismissing={dismissal.isPending}
              onDismiss={() => {
                dismissal.mutate({
                  kind: 'group',
                  fingerprint: group.fingerprint,
                  observations: group.observations,
                });
              }}
            />
          ))}
        </List>
      )}
    </>
  );
}

function InboxNavigation({
  newer,
  older,
  disabled,
}: {
  readonly newer: (() => void) | null;
  readonly older: (() => void) | null;
  readonly disabled: boolean;
}): ReactNode {
  if (newer === null && older === null) return null;
  return (
    <View className="flex-row justify-between gap-2">
      {newer === null ? (
        <View />
      ) : (
        <Button
          label="Newer"
          icon="chevronLeft"
          variant="text"
          disabled={disabled}
          onPress={newer}
        />
      )}
      {older === null ? null : (
        <Button
          label="Older"
          icon="chevronRight"
          variant="text"
          disabled={disabled}
          onPress={older}
        />
      )}
    </View>
  );
}

function ClearInactive({
  query,
  dismissal,
  older,
  resetPage,
}: {
  readonly query: ReturnType<typeof useAiRepairGroups>;
  readonly dismissal: ReturnType<typeof useDismissAiRepairGroups>;
  readonly older: boolean;
  readonly resetPage: () => void;
}): ReactNode {
  if (!older && (query.data === undefined || query.data.groups.length === 0)) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-x-1 px-2">
      <Button
        label="Clear inactive"
        variant="text"
        disabled={dismissal.isPending}
        onPress={() => {
          dismissal.mutate(
            { kind: 'inactive' },
            {
              onSuccess: ({ dismissed }): void => {
                if (dismissed > 0) resetPage();
              },
            },
          );
        }}
      />
      <Text variant="footnote" tone="variant" className="px-2">
        Clears inactive groups across all pages. Keeps logs and chats.
      </Text>
    </View>
  );
}

function ErrorGroups({
  diagnosisFor,
}: {
  readonly diagnosisFor: ReturnType<typeof useDiagnosisRequests>;
}): ReactNode {
  const [cursors, setCursors] = useState<readonly Cursor[]>([null]);
  const query = useAiRepairGroups(cursors.at(-1) ?? null);
  const dismissal = useDismissAiRepairGroups();
  const refresh = useRefreshAiRepairGroups();
  const older = cursors.length > 1;
  const next = query.data?.next ?? null;
  return (
    <Section
      title={older ? 'Earlier errors' : 'Recent errors'}
      action={<SectionAction label="Refresh" onPress={refresh} />}
    >
      <InboxNavigation
        newer={
          older
            ? (): void => {
                setCursors(cursors.slice(0, -1));
              }
            : null
        }
        older={
          next === null
            ? null
            : (): void => {
                setCursors([...cursors, next]);
              }
        }
        disabled={dismissal.isPending}
      />
      <ClearInactive
        query={query}
        dismissal={dismissal}
        older={older}
        resetPage={() => {
          setCursors([null]);
        }}
      />
      <ErrorGroupList
        query={query}
        dismissal={dismissal}
        diagnosisFor={diagnosisFor}
        older={older}
      />
    </Section>
  );
}

export function AiRepairInbox(): ReactNode {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [toggle, setToggle] = useState<{
    readonly focus: string | undefined;
    readonly open: boolean;
  }>();
  const open =
    toggle?.focus === focus && toggle !== undefined
      ? toggle.open
      : focus === INBOX_FOCUS || focus?.startsWith(`${INBOX_FOCUS}.`) === true;
  const diagnosisFor = useDiagnosisRequests();
  return (
    <CollapseRoot className="gap-1">
      <Card padding="none">
        <Interactive
          label="Error investigations"
          expanded={open}
          onPress={() => {
            setToggle({ focus, open: !open });
          }}
          className="min-h-touch-min flex-row items-center justify-between gap-2 rounded-lg px-4 py-2"
          layerClassName="rounded-lg"
        >
          <Text variant="body-strong">Error investigations</Text>
          <TurnChevron open={open} />
        </Interactive>
      </Card>
      {open ? (
        <CollapseBody>
          <ErrorGroups diagnosisFor={diagnosisFor} />
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
