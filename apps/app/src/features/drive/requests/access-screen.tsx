import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveAccessRequest, DriveGrantRole, DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import {
  useAccessRequest,
  useDriveAccessRequestRows,
  useDriveOpenItem,
  useDriveRoots,
  useViewerId,
} from '../data';
import { DriveFrame } from '../components/drive-frame';
import { openHrefOf } from '../recent/recent-model';
import {
  ASK_AGAIN_LINE,
  ASK_TITLE,
  UNAVAILABLE_BODY,
  UNAVAILABLE_TITLE,
  WANTED_ROLE_OPTIONS,
  accessScreenStateOf,
  askBodyOf,
  declinedLineOf,
  messageOf,
  sentLineOf,
  type AccessScreenState,
} from './access-model';

function Card({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="w-full gap-4 rounded-lg border-hairline border-outline-variant bg-surface-1 p-card-pad">
      {children}
    </View>
  );
}

function Head({
  icon,
  title,
}: {
  readonly icon: 'key' | 'clock';
  readonly title: string;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <View className="size-12 items-center justify-center rounded-full bg-primary-container">
        <Icon name={icon} size={24} tone="primary" />
      </View>
      <Text variant="title-3" accessibilityRole="header" className="min-w-0 flex-1">
        {title}
      </Text>
    </View>
  );
}

function AskFields({
  role,
  message,
  disabled,
  onRole,
  onMessage,
}: {
  readonly role: DriveGrantRole;
  readonly message: string;
  readonly disabled: boolean;
  readonly onRole: (role: DriveGrantRole) => void;
  readonly onMessage: (message: string) => void;
}): ReactNode {
  return (
    <>
      <View className="gap-1.5">
        <Text variant="caption" tone="variant">
          Ask to
        </Text>
        <Segmented
          options={WANTED_ROLE_OPTIONS}
          value={role}
          label="Ask to"
          disabled={disabled}
          onChange={onRole}
        />
      </View>
      <TextField
        label="Message"
        value={message}
        multiline
        disabled={disabled}
        helper="Optional. Say why you need it."
        onChange={onMessage}
      />
    </>
  );
}

function DeclinedBanner({
  declined,
  ownerName,
  now,
}: {
  readonly declined: DriveAccessRequest | null;
  readonly ownerName: string | null;
  readonly now: number;
}): ReactNode {
  if (declined === null) return null;
  return (
    <Banner tone="warning" title={declinedLineOf(declined, now, ownerName)} body={ASK_AGAIN_LINE} />
  );
}

function Ask({
  itemId,
  ownerName,
  declined,
}: {
  readonly itemId: string;
  readonly ownerName: string | null;
  readonly declined: DriveAccessRequest | null;
}): ReactNode {
  const now = useMinute();
  const live = useSyncStatus().status === 'live';
  const ask = useAccessRequest();
  const [role, setRole] = useState<DriveGrantRole>('view');
  const [message, setMessage] = useState('');
  return (
    <Card>
      <DeclinedBanner declined={declined} ownerName={ownerName} now={now} />
      <Head icon="key" title={ASK_TITLE} />
      <Text variant="callout" tone="variant">
        {askBodyOf(ownerName)}
      </Text>
      <AskFields
        role={role}
        message={message}
        disabled={!live}
        onRole={setRole}
        onMessage={setMessage}
      />
      <View className="flex-row">
        <Button
          label="Request access"
          icon="key"
          loading={ask.busy}
          disabled={!live}
          onPress={() => {
            ask.run({ itemId, role, message: messageOf(message) });
          }}
        />
      </View>
      {ask.problem === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {ask.problem}
        </Text>
      )}
    </Card>
  );
}

const SHARED_HREF = href.drivePage('shared');

const CRUMBS = [{ label: 'Shared', href: SHARED_HREF }, { label: 'Request access' }] as const;

function BackToShared(): ReactNode {
  return <Button label="Back to Shared" icon="arrowLeft" variant="tonal" href={SHARED_HREF} />;
}

function CardSkeleton(): ReactNode {
  return (
    <View
      aria-busy
      accessibilityLabel="Loading"
      className="w-full gap-4 rounded-lg border-hairline border-outline-variant bg-surface-1 p-card-pad"
    >
      <View className="flex-row items-center gap-3">
        <Skeleton shape="circle" className="size-12" />
        <Skeleton shape="line" className="h-6 w-48" />
      </View>
      <Skeleton shape="line" className="w-3/4" />
      <Skeleton shape="block" className="h-10 w-40" />
      <Skeleton shape="block" className="h-24" />
    </View>
  );
}

function Sent({
  request,
  ownerName,
}: {
  readonly request: DriveAccessRequest;
  readonly ownerName: string | null;
}): ReactNode {
  const now = useMinute();
  return (
    <Card>
      <Head icon="clock" title="Request sent" />
      <Text variant="callout" tone="variant">
        {sentLineOf(request, now, ownerName)}
      </Text>
      {request.message === null ? null : (
        <Text variant="footnote" tone="variant">
          {`Your message: “${request.message}”`}
        </Text>
      )}
      <View className="flex-row">
        <BackToShared />
      </View>
    </Card>
  );
}

function Opening({ item }: { readonly item: DriveItem }): ReactNode {
  const roots = useDriveRoots();
  useEffect(() => {
    router.replace(openHrefOf(item, roots));
  }, [item, roots]);
  return (
    <View aria-busy accessibilityLabel={`Opening ${item.name}`} className="gap-3">
      <Text variant="callout" tone="variant">
        {`Opening ${item.name}`}
      </Text>
      <Skeleton shape="block" className="h-row-h-2" />
    </View>
  );
}

function useLiveState(itemId: string, state: AccessScreenState | null): AccessScreenState | null {
  const viewerId = useViewerId();
  const mine = useDriveAccessRequestRows().find(
    (row) =>
      row.itemId === itemId && row.requesterProfileId === viewerId && row.state === 'pending',
  );
  if (state === null || state.kind === 'open') return state;
  return mine === undefined ? state : { kind: 'sent', request: mine };
}

function useOwnerName(request: DriveAccessRequest | null): string | null {
  const profiles = useProfiles();
  if (request === null) return null;
  return profiles.find((profile) => profile.id === request.ownerProfileId)?.name ?? null;
}

function requestOf(state: AccessScreenState): DriveAccessRequest | null {
  return state.kind === 'sent' || state.kind === 'declined' ? state.request : null;
}

function Content({ itemId }: { readonly itemId: string }): ReactNode {
  const query = useDriveOpenItem(itemId);
  const answered = useDriveAccessRequestRows().some(
    (row) => row.itemId === itemId && row.state === 'approved',
  );
  const { refetch } = query;
  useEffect(() => {
    if (answered) background(refetch(), 'drive.open_item.refetch_failed');
  }, [answered, refetch]);
  const state = useLiveState(
    itemId,
    query.data === undefined ? null : accessScreenStateOf(query.data),
  );
  const ownerName = useOwnerName(state === null ? null : requestOf(state));
  if (state === null) {
    return query.isError ? (
      <ErrorState
        page
        error={query.error}
        retry={() => {
          background(refetch(), 'drive.open_item.retry_failed');
        }}
      />
    ) : (
      <CardSkeleton />
    );
  }
  switch (state.kind) {
    case 'open':
      return <Opening item={state.item} />;
    case 'sent':
      return <Sent request={state.request} ownerName={ownerName} />;
    case 'unavailable':
      return (
        <EmptyState
          icon="ban"
          title={UNAVAILABLE_TITLE}
          body={UNAVAILABLE_BODY}
          action={<BackToShared />}
        />
      );
    case 'declined':
      return <Ask itemId={itemId} ownerName={ownerName} declined={state.request} />;
    case 'ask':
      return <Ask itemId={itemId} ownerName={null} declined={null} />;
  }
}

export function AccessScreen({ itemId }: { readonly itemId: string }): ReactNode {
  return (
    <DriveFrame section="shared" title="Request access" breadcrumbs={CRUMBS} back>
      <Content itemId={itemId} />
    </DriveFrame>
  );
}
