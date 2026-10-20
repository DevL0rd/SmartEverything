import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { CredentialsForm } from '../components/credentials-form';
import { PrinterCallError } from '../data/printer-api';
import { Anchored } from './anchored';
import type { SettingsProps } from './settings-props';

function credentialsError(error: unknown): string {
  if (error instanceof PrinterCallError && error.reason === 'not_authenticated') {
    return 'The printer did not accept this user name and password.';
  }
  return error instanceof Error ? error.message : 'Could not sign in';
}

function Credentials({ device, actor }: SettingsProps): ReactNode {
  const submit = async (user: string, password: string): Promise<string | null> => {
    try {
      await actor.throwing({ action: 'credentials', printer: device.external_id, user, password });
      return null;
    } catch (error) {
      return credentialsError(error);
    }
  };
  return (
    <Anchored deviceId={device.id} id="credentials" label="Printer sign-in">
      <View className="px-4 py-3">
        <CredentialsForm onSubmit={submit} />
      </View>
    </Anchored>
  );
}

function Certificate({ device, settings, actor }: SettingsProps): ReactNode {
  const change = settings.certificateChange;
  if (change === null) return null;
  return (
    <Anchored deviceId={device.id} id="trust-certificate" label="Trust the new certificate">
      <ActionRow
        icon="shield"
        title="Trust the new certificate"
        subtitle={change.presented}
        wrapSubtitle
        onPress={() => {
          actor.fire(
            {
              action: 'trust_certificate',
              printer: device.external_id,
              fingerprint: change.presented,
            },
            'Could not trust the certificate',
          );
        }}
      />
    </Anchored>
  );
}

function Forget({ device, actor }: SettingsProps): ReactNode {
  const forget = async (): Promise<void> => {
    const accepted = await confirm({
      title: 'Forget this printer?',
      body: 'Its history stays on the hub until you clear it.',
      confirmLabel: 'Forget',
      tone: 'destructive',
    });
    if (accepted) {
      actor.fire({ action: 'forget', printer: device.external_id }, 'Could not forget the printer');
    }
  };
  return (
    <Anchored deviceId={device.id} id="forget" label="Forget this printer">
      <ActionRow
        icon="trash"
        title="Forget this printer"
        destructive
        onPress={() => {
          background(forget(), 'printer.confirm_failed');
        }}
      />
    </Anchored>
  );
}

function OwnerRows(props: SettingsProps): ReactNode {
  const { device, actor } = props;
  return (
    <>
      <Certificate {...props} />
      <Credentials {...props} />
      <Anchored deviceId={device.id} id="rescan" label="Look for printers again">
        <ActionRow
          icon="refresh"
          title="Look for printers again"
          onPress={() => {
            actor.fire({ action: 'rescan' }, 'Could not look for printers');
          }}
        />
      </Anchored>
      <Forget {...props} />
    </>
  );
}

export function ConnectionList(props: SettingsProps): ReactNode {
  const { device, settings, owner } = props;
  return (
    <List title="Connection">
      <Anchored deviceId={device.id} id="connection" label="Printer address and security">
        <ValueRow
          icon="link"
          title="Address"
          subtitle={settings.uri}
          wrapSubtitle
          value={settings.secure ? 'ipps' : 'ipp'}
        />
      </Anchored>
      {settings.fingerprint === null ? null : (
        <ValueRow
          icon="shield"
          title="Pinned certificate"
          subtitle={settings.fingerprint}
          wrapSubtitle
          value="Pinned"
        />
      )}
      {owner ? <OwnerRows {...props} /> : null}
    </List>
  );
}
