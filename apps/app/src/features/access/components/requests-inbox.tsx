import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AccessRequestRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { readMinute, useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useAccessRequests, useRequestActions, type RequestActions } from '../data/access-data';
import { useRequestNames } from '../data/request-names';
import {
  GRANT_PRESETS,
  pendingFirst,
  requestStatusText,
  targetText,
  untilOf,
  type RequestNames,
} from '../model/requests';

function DecisionSheet({
  request,
  who,
  what,
  actions,
  onClose,
}: {
  readonly request: AccessRequestRow;
  readonly who: string;
  readonly what: string;
  readonly actions: RequestActions;
  readonly onClose: () => void;
}): ReactNode {
  const decide = (approve: boolean, until: string | null): void => {
    onClose();
    actions
      .decide(request.id, { approve, until, target: null })
      .catch(
        notifyFailure(approve ? 'The request was not approved' : 'The request was not denied'),
      );
  };
  return (
    <Sheet open onClose={onClose} title={`${who} asks for ${what}`} detents={['fit']}>
      {request.note === '' ? null : <Text variant="callout">{request.note}</Text>}
      <List>
        {GRANT_PRESETS.map((preset) => (
          <ListRow
            key={preset.id}
            title={`Approve ${preset.label.toLowerCase()}`}
            icon="check"
            onPress={() => {
              decide(true, untilOf(preset, readMinute()));
            }}
          />
        ))}
        <ListRow
          title="Deny"
          icon="close"
          destructive
          onPress={() => {
            decide(false, null);
          }}
        />
      </List>
    </Sheet>
  );
}

function RequestRow({
  request,
  names,
  actions,
}: {
  readonly request: AccessRequestRow;
  readonly names: RequestNames;
  readonly actions: RequestActions;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const now = useMinute();
  const who = useProfiles().find((profile) => profile.id === request.profile_id)?.name ?? 'Someone';
  const what = targetText(request, names);
  const pending = request.status === 'pending';
  const ask = (): void => {
    setOpen(true);
  };
  return (
    <>
      <ListRow
        title={`${who}: ${what}`}
        subtitle={requestStatusText(request, now)}
        {...(request.note === '' ? {} : { caption: request.note })}
        wrapSubtitle
        icon={pending ? 'bell' : 'key'}
        iconTone={pending ? 'primary' : 'variant'}
        chevron={pending}
        {...(pending ? { onPress: ask } : {})}
      />
      {open ? (
        <DecisionSheet
          request={request}
          who={who}
          what={what}
          actions={actions}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function RequestsInbox(): ReactNode {
  const requests = useAccessRequests();
  const actions = useRequestActions();
  const names = useRequestNames();
  if (requests.isError) {
    return (
      <ErrorState
        error={requests.error}
        retry={() => {
          background(requests.refetch(), 'access.requests_refetch_failed');
        }}
      />
    );
  }
  if (requests.data === undefined) {
    return <Skeleton shape="block" className="h-24" />;
  }
  if (requests.data.length === 0) {
    return (
      <EmptyState
        icon="key"
        title="No requests"
        body="When someone asks for more access, it shows up here and you are told."
      />
    );
  }
  return (
    <List inset>
      {pendingFirst(requests.data).map((request) => (
        <RequestRow key={request.id} request={request} names={names} actions={actions} />
      ))}
    </List>
  );
}
