import type { ReactNode } from 'react';
import { useState } from 'react';
import { HTTPS_URL, type SettingsRow } from '@smarteverything/domain';
import { setPublicUrl, verifyPublicUrl } from '../../../api/access';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { Tone } from '../../../components/tone';
import { breakableUrl } from '../../../format/text';
import { moment } from '../../../format/time';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useIsOwner, useSettings } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';

interface Verdict {
  readonly icon: IconName;
  readonly tone: Tone;
  readonly title: string;
  readonly subtitle: string;
}

function verdictOf(settings: SettingsRow, now: number): Verdict {
  if (settings.public_url_error !== null) {
    return {
      icon: 'circleX',
      tone: 'critical',
      title: 'Can’t reach it',
      subtitle: settings.public_url_error,
    };
  }
  if (settings.public_url_verified_at === null) {
    return { icon: 'alert', tone: 'warning', title: 'Not checked yet', subtitle: 'Tap to check' };
  }
  return {
    icon: 'circleCheck',
    tone: 'positive',
    title: 'Verified',
    subtitle: `Checked ${moment(settings.public_url_verified_at, now, settings.time_zone)}`,
  };
}

export function normalised(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function useAddressEditor(): {
  readonly request: TextEditRequest | null;
  readonly open: () => void;
  readonly close: () => void;
} {
  const store = useEntityStore();
  const current = useSettings().public_url;
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  return {
    request,
    close: (): void => {
      setRequest(null);
    },
    open: (): void => {
      setRequest({
        title: current === null ? 'Set public address' : 'Change public address',
        label: 'Public address',
        initial: current ?? '',
        placeholder: 'https://',
        confirmLabel: 'Save',
        maxLength: 2000,
        kind: 'url',
        helper: 'Phones and assistants use it when you’re away',
        problemOf: (value) =>
          HTTPS_URL.safeParse(normalised(value)).success ? null : 'Use an https:// address',
        save: (value) => setPublicUrl(store, normalised(value)),
      });
    },
  };
}

function VerifyRow({ settings }: { readonly settings: SettingsRow }): ReactNode {
  const store = useEntityStore();
  const check = useMutationState();
  const verdict = verdictOf(settings, useMinute());
  return (
    <ListRow
      icon={verdict.icon}
      iconTone={verdict.tone}
      title={verdict.title}
      subtitle={check.busy ? 'Checking…' : verdict.subtitle}
      subtitleTone={verdict.tone === 'critical' ? 'critical' : 'variant'}
      label="Check the public address again"
      disabled={check.busy}
      onPress={() => {
        check.run(() => verifyPublicUrl(store), { failure: 'The address wasn’t checked' });
      }}
    />
  );
}

function OwnerRows({ settings }: { readonly settings: SettingsRow }): ReactNode {
  const editor = useAddressEditor();
  return (
    <>
      <ListRow
        icon="globe"
        title="Public address"
        subtitle={
          settings.public_url === null
            ? 'Not set. Phones only work at home.'
            : breakableUrl(settings.public_url)
        }
        value={settings.public_url === null ? 'Set' : 'Change'}
        chevron
        onPress={editor.open}
      />
      {settings.public_url === null ? null : <VerifyRow settings={settings} />}
      <TextEditSheet request={editor.request} onClose={editor.close} />
    </>
  );
}

export function PublicUrlSection(): ReactNode {
  const settings = useSettings();
  const owner = useIsOwner();
  return (
    <List
      inset
      title="Remote access"
      footer="Phones and assistants reach your server here when you’re away."
    >
      {owner ? (
        <OwnerRows settings={settings} />
      ) : (
        <ListRow
          icon="globe"
          title="Public address"
          subtitle={settings.public_url === null ? 'Not set' : breakableUrl(settings.public_url)}
        />
      )}
    </List>
  );
}
