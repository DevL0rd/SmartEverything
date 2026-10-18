import type { ReactNode } from 'react';
import {
  PROVIDER_INFO,
  isScale,
  type Provider,
  type ProviderLinkRow,
  type SmartThingsWebhook,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { authorizeSmartThings } from '../../../api/smartthings';
import { discoverDevices, unlinkProvider } from '../../../api/providers';
import { confirm } from '../../../components/confirm-store';
import { ActionRow, NavRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notify, notifyFailure } from '../../../components/toast-store';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useDevices, useSmartThingsWebhook } from '../../../store/selectors';
import { CONNECT_FLOW, isAddable } from '../model/brands';
import { openInBrowser } from '../flows/prompt-body';
import { leaveFlow } from '../flows/leave-flow';

import { trackConnection } from '../connections-log';
import { background } from '@smarteverything/logging';
function webhookText(webhook: SmartThingsWebhook | null, now: number): string {
  const confirmedAt = webhook?.confirmedAt ?? null;
  if (webhook === null || confirmedAt === null) {
    return 'Not confirmed';
  }
  return webhook.lastEventAt === null
    ? 'Working'
    : `Last update ${relative(webhook.lastEventAt, now)}`;
}

function WebhookRow(): ReactNode {
  const webhook = useSmartThingsWebhook();
  const now = useMinute();
  const lastError = webhook?.lastError ?? null;
  const value = webhookText(webhook, now);
  return (
    <ValueRow
      icon="activity"
      title="Live updates"
      value={value}
      {...(lastError === null ? {} : { subtitle: lastError })}
    />
  );
}

function useHasScale(provider: Provider): boolean {
  return useDevices({ includeHidden: true }).some(
    (device) => device.provider === provider && isScale(device),
  );
}

function ScaleRow(): ReactNode {
  return (
    <NavRow
      icon="scale"
      title="Bluetooth scale"
      subtitle="Read weigh-ins on your phone"
      href={href.connect('scale')}
    />
  );
}

function providerRow(provider: Provider): ReactNode {
  if (provider === 'tuya') {
    return (
      <NavRow
        icon="remote"
        title="IR remotes"
        subtitle="Need a developer project"
        href={href.connect('tuya-developer')}
      />
    );
  }
  if (provider === 'smartthings') {
    return <WebhookRow />;
  }
  return null;
}

function unlink(provider: Provider): void {
  const name = PROVIDER_INFO[provider].name;
  background(
    confirm({
      title: `Unlink ${name}?`,
      body: 'Its devices disappear until you link it again.',
      confirmLabel: 'Unlink',
      tone: 'destructive',
    }).then((accepted) => {
      if (accepted) {
        trackConnection('provider.unlink', { provider }, () => unlinkProvider(provider)).then(
          leaveFlow,
          notifyFailure(`${name} wasn’t unlinked`),
        );
      }
    }),
    'account_rows.confirm_failed',
  );
}

function signInAgainRow(provider: Provider): ReactNode {
  if (provider === 'smartthings') {
    return (
      <ActionRow
        icon="refresh"
        title="Sign in to Samsung again"
        onPress={() => {
          trackConnection('smartthings.authorize', {}, () => authorizeSmartThings()).then(
            openInBrowser,
            notifyFailure('Sign-in didn’t open'),
          );
        }}
      />
    );
  }
  return isAddable(provider) ? (
    <NavRow icon="refresh" title="Sign in again" href={href.connect(CONNECT_FLOW[provider])} />
  ) : null;
}

export function AccountRows({ row }: { readonly row: ProviderLinkRow }): ReactNode {
  const { provider } = row;
  const hasScale = useHasScale(provider);
  return (
    <>
      <List inset>
        <NavRow
          icon="bulb"
          title="Devices from this account"
          value={String(row.device_count)}
          href={{ pathname: '/settings/[...page]', params: { page: ['devices'], provider } }}
        />
        <ActionRow
          icon="search"
          title="Find new devices"
          onPress={() => {
            trackConnection('provider.discover', { provider }, () =>
              discoverDevices(provider),
            ).then(() => {
              notify({ message: 'Looking for new devices' });
            }, notifyFailure('The search didn’t start'));
          }}
        />
        {signInAgainRow(provider)}
        {providerRow(provider)}
        {provider === 'xiaomi' && hasScale ? <ScaleRow /> : null}
      </List>
      <List inset>
        <ActionRow
          icon="trash"
          title={`Unlink ${PROVIDER_INFO[provider].name}`}
          destructive
          onPress={() => {
            unlink(provider);
          }}
        />
      </List>
    </>
  );
}
