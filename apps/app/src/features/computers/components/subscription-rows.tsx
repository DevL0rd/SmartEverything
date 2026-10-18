import { useState, type ReactNode } from 'react';
import type {
  AiSubscriptionProvider,
  AiSubscriptionHostStatus,
  AiModelRoute,
  AiHarnessHost,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { NavRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useActiveProfile } from '../../../store/people';
import { useIsOwner, useSyncStatus, useDevice } from '../../../store/selectors';
import { useHarnessCatalogue } from '../../assistant';
import {
  SUBSCRIPTION_LABELS,
  subscriptionUnavailable,
  subscriptionSummary,
  type SubscriptionSummary,
} from '../model/subscription';
import { SubscriptionSheet } from './subscription-sheet';
interface Props {
  readonly deviceId: string;
  readonly provider: AiSubscriptionProvider;
}
interface Binding extends Props {
  readonly profileId: string;
  readonly profileName: string;
}
export function SubscriptionRows(props: Props): ReactNode {
  const profile = useActiveProfile();
  if (profile === null) return null;
  return (
    <SubscriptionContent
      key={`${profile.id}:${props.deviceId}:${props.provider}:${api().baseUrl}`}
      {...props}
      profileId={profile.id}
      profileName={profile.name}
    />
  );
}
function useSubscriptionAvailability(binding: Binding): {
  readonly owner: boolean;
  readonly unavailable: string | null;
  readonly route: AiModelRoute | undefined;
  readonly identity: string;
} {
  const owner = useIsOwner();
  const sync = useSyncStatus();
  const device = useDevice(binding.deviceId);
  const catalogue = useHarnessCatalogue();
  const host = catalogue.data?.hosts.find(
    (item) => item.target.kind === 'device' && item.target.device_id === binding.deviceId,
  );
  const unavailable = subscriptionAvailability({
    owner,
    live: sync.status === 'live',
    pending: catalogue.isPending,
    error: catalogue.error,
    host,
  });
  const kind = binding.provider === 'claude' ? 'claude-subscription-oauth' : 'chatgpt-codex-oauth';
  const route = catalogue.data?.routes.find(
    (item) =>
      item.profile_id === binding.profileId &&
      item.supplier.kind === 'device' &&
      item.supplier.device_id === binding.deviceId &&
      item.auth.kind === kind,
  );
  return {
    owner,
    unavailable,
    route,
    identity: `${device?.label ?? 'Computer unavailable'} · ${binding.profileName}`,
  };
}
function routeDetail(route: AiModelRoute | undefined): string {
  if (route === undefined) return 'Open Subscription to check sign-in and billing.';
  return route.state === 'ready'
    ? 'Pick this computer with Switch machine to use it.'
    : route.failure.message;
}
function SubscriptionContent(binding: Binding): ReactNode {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const availability = useSubscriptionAvailability(binding);
  const available = routeAvailable(availability.unavailable, availability.route, summary);
  const label = subscriptionLabel(summary, availability.unavailable, available);
  const detail =
    availability.unavailable ??
    (summary === null ? 'Check subscription sign-in on this computer' : summary.message);
  const changed = (status: AiSubscriptionHostStatus): void => {
    setSummary(subscriptionSummary(status));
  };
  return (
    <>
      <List title="Subscription" footer="This sign-in is only for SmartEverything chats.">
        <NavRow
          title="Subscription"
          subtitle={detail}
          wrapSubtitle
          value={label}
          disabled={!availability.owner}
          onPress={() => {
            setOpen(true);
          }}
        />
        <ValueRow
          title="Use in SmartEverything"
          value={available ? 'Available' : 'Unavailable'}
          subtitle={availability.unavailable ?? routeDetail(availability.route)}
          wrapSubtitle
        />
      </List>
      {!open ? null : (
        <SubscriptionSheet
          {...binding}
          identity={availability.identity}
          unavailable={availability.unavailable}
          close={() => {
            setOpen(false);
          }}
          changed={changed}
        />
      )}
    </>
  );
}

function subscriptionLabel(
  summary: SubscriptionSummary | null,
  unavailable: string | null,
  available: boolean,
): string {
  if (unavailable !== null) return 'Unavailable';
  if (summary?.state === 'ready' && !available) return 'Check status';
  if (summary !== null) return SUBSCRIPTION_LABELS[summary.state];
  return available ? 'Ready' : 'Check status';
}

function routeAvailable(
  unavailable: string | null,
  route: AiModelRoute | undefined,
  summary: SubscriptionSummary | null,
): boolean {
  return (
    unavailable === null &&
    route?.state === 'ready' &&
    (summary === null || summary.state === 'ready')
  );
}

function subscriptionAvailability({
  owner,
  live,
  pending,
  error,
  host,
}: {
  readonly owner: boolean;
  readonly live: boolean;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly host: AiHarnessHost | undefined;
}): string | null {
  if (!owner) return 'Only the owner can manage subscription sign-in.';
  if (!live) return subscriptionUnavailable(host, false);
  if (pending) return 'Checking this computer’s runtime…';
  if (error !== null) return 'Couldn’t read this computer. Reconnect and try again.';
  return subscriptionUnavailable(host, true);
}
