import { MAIL_SECURITIES, type MailSettings, type MailTestResult } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { readMailSettings, sendMailTest, writeMailSettings } from '../../../api/mail';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ErrorState } from '../../../components/error-state';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { StatusChip } from '../../../components/status-chip';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notify, notifyFailure } from '../../../components/toast-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { EmailPassword } from './email-password';
import {
  SECURITY_LABEL,
  SECURITY_TEXT,
  draftOfSettings,
  emailStatusOf,
  isAddress,
  problemsOf,
  sameAsSaved,
  securityEdit,
  writeOf,
  type EmailDraft,
} from './email-model';

export const MAIL_SETTINGS_KEY = ['window', 'mail', 'settings'] as const;

type Edit = (edit: Partial<EmailDraft>) => void;

function StatusCard({ settings }: { readonly settings: MailSettings | null }): ReactNode {
  return (
    <Card
      title="Outgoing email"
      icon="atSign"
      action={
        <StatusChip
          status={settings === null ? 'stale' : 'live'}
          label={settings === null ? 'Not set up' : 'Set up'}
        />
      }
    >
      <Text variant="callout" tone="variant">
        {emailStatusOf(settings)}
      </Text>
      <Text variant="footnote" tone="variant">
        The hub sends Planner invitations, updates and booking confirmations through this server.
        Replies to the email are not read; guests answer with the Yes, Maybe and No links.
      </Text>
    </Card>
  );
}

function SecurityField({
  draft,
  onChange,
}: {
  readonly draft: EmailDraft;
  readonly onChange: Edit;
}): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="label" tone="variant">
        Security
      </Text>
      <Segmented
        label="Security"
        options={MAIL_SECURITIES.map((value) => ({
          value,
          label: SECURITY_LABEL[value],
          spoken: SECURITY_TEXT[value],
        }))}
        value={draft.security}
        fill
        onChange={(security) => {
          onChange(securityEdit(draft, security));
        }}
      />
      <Text variant="footnote" tone="variant">
        {SECURITY_TEXT[draft.security]}
      </Text>
    </View>
  );
}

function ServerFields({
  draft,
  shown,
  onChange,
}: {
  readonly draft: EmailDraft;
  readonly shown: boolean;
  readonly onChange: Edit;
}): ReactNode {
  const problems = problemsOf(draft);
  return (
    <Card title="Server" icon="server">
      <TextField
        label="Server"
        kind="url"
        value={draft.host}
        placeholder="smtp.example.com"
        error={shown ? problems.host : null}
        onChange={(host) => {
          onChange({ host });
        }}
      />
      <SecurityField draft={draft} onChange={onChange} />
      <TextField
        label="Port"
        kind="number"
        value={draft.port}
        error={shown ? problems.port : null}
        onChange={(port) => {
          onChange({ port });
        }}
      />
      <TextField
        label="User name"
        kind="email"
        value={draft.user}
        placeholder="Leave empty when the server needs no sign in"
        onChange={(user) => {
          onChange({ user });
        }}
      />
      <EmailPassword draft={draft} onChange={onChange} />
    </Card>
  );
}

function SenderFields({
  draft,
  shown,
  onChange,
}: {
  readonly draft: EmailDraft;
  readonly shown: boolean;
  readonly onChange: Edit;
}): ReactNode {
  return (
    <Card title="Sender" icon="user">
      <TextField
        label="From name"
        value={draft.fromName}
        placeholder="Alex at home"
        onChange={(fromName) => {
          onChange({ fromName });
        }}
      />
      <TextField
        label="From address"
        kind="email"
        value={draft.fromAddress}
        placeholder="you@example.com"
        error={shown ? problemsOf(draft).fromAddress : null}
        onChange={(fromAddress) => {
          onChange({ fromAddress });
        }}
      />
    </Card>
  );
}

function TestCard({ settings }: { readonly settings: MailSettings }): ReactNode {
  const [to, setTo] = useState(settings.from_address);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<MailTestResult | null>(null);
  const send = (): void => {
    setSending(true);
    setResult(null);
    background(
      sendMailTest({ to: to.trim() })
        .then(setResult)
        .catch(notifyFailure('The test email could not be sent'))
        .finally(() => {
          setSending(false);
        }),
      'connections.mail_test_failed',
    );
  };
  return (
    <Card title="Send a test" icon="share">
      <TextField
        label="Send to"
        kind="email"
        value={to}
        onChange={(next) => {
          setTo(next);
          setResult(null);
        }}
      />
      {result === null ? null : result.outcome === 'sent' ? (
        <Banner tone="positive" title="Sent" body={`Check the inbox of ${to.trim()}.`} wrapBody />
      ) : (
        <Banner tone="critical" title="Not sent" body={result.detail} wrapBody />
      )}
      <View className="flex-row justify-end">
        <Button
          label="Send a test"
          icon="arrowRight"
          variant="tonal"
          loading={sending}
          disabled={!isAddress(to)}
          onPress={send}
        />
      </View>
    </Card>
  );
}

function useSaveMail(onSaved: (settings: MailSettings) => void): {
  readonly saving: boolean;
  readonly save: (draft: EmailDraft) => void;
} {
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const save = (draft: EmailDraft): void => {
    const body = writeOf(draft);
    if (body === null) return;
    setSaving(true);
    background(
      writeMailSettings(body)
        .then((settings) => {
          client.setQueryData(MAIL_SETTINGS_KEY, settings);
          onSaved(settings);
          notify({ message: 'Email settings saved', tone: 'positive' });
        })
        .catch(notifyFailure('The email settings could not be saved'))
        .finally(() => {
          setSaving(false);
        }),
      'connections.mail_save_failed',
    );
  };
  return { saving, save };
}

function EmailForm({ settings }: { readonly settings: MailSettings | null }): ReactNode {
  const [draft, setDraft] = useState(() => draftOfSettings(settings));
  const [tried, setTried] = useState(false);
  const { saving, save } = useSaveMail((saved) => {
    setDraft(draftOfSettings(saved));
    setTried(false);
  });
  const onChange: Edit = (edit) => {
    setDraft((current) => ({ ...current, ...edit }));
  };
  const unchanged = sameAsSaved(draft, settings);
  return (
    <View className="gap-section-gap">
      <StatusCard settings={settings} />
      <ServerFields draft={draft} shown={tried} onChange={onChange} />
      <SenderFields draft={draft} shown={tried} onChange={onChange} />
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button
          label="Undo changes"
          variant="text"
          disabled={unchanged}
          onPress={() => {
            setDraft(draftOfSettings(settings));
            setTried(false);
          }}
        />
        <Button
          label={settings === null ? 'Set up email' : 'Save'}
          icon="check"
          loading={saving}
          disabled={unchanged}
          onPress={() => {
            setTried(true);
            save(draft);
          }}
        />
      </View>
      {settings === null ? null : <TestCard settings={settings} />}
    </View>
  );
}

export function EmailSettings(): ReactNode {
  const query = useScreenQuery({
    queryKey: MAIL_SETTINGS_KEY,
    queryFn: ({ signal }) => readMailSettings(signal),
  });
  if (query.data !== undefined) return <EmailForm settings={query.data} />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          background(query.refetch(), 'connections.mail_refetch_failed');
        }}
      />
    );
  }
  return (
    <View className="gap-3">
      <Skeleton shape="tile" />
      <Skeleton shape="block" />
    </View>
  );
}
