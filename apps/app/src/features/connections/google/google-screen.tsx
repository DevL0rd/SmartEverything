import type { ReactNode } from 'react';
import type { GoogleAccountRow } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { ActionRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { SettingsFrame } from '../../../settings/settings-frame';
import { unlinkGoogleOf } from './google-actions';
import { GoogleAppCard } from './google-app-card';
import { REFUSED_CLIENT, type GoogleClientPlatform } from './google-app-setup';
import { syncedLists } from './google-choices';
import { GoogleIntro } from './google-intro';
import { GOOGLE_SERVICE_SECTIONS } from './google-sections';
import { problemText } from './google-status';
import { GoogleStatusCard } from './google-status-card';
import { GoogleSyncLog } from './google-sync-log';
import type { GoogleLinkState, UseGoogleLink } from './link-slot';
import {
  useGoogleAccountOf,
  useGoogleCollections,
  useGoogleSubject,
  useGoogleSyncLog,
  type GoogleSubject,
} from './use-google';

const STATUS_DETAIL: Readonly<Record<GoogleAccountRow['status'], string>> = {
  unlinked: 'not linked',
  linking: 'signing in',
  needs_attention: 'needs attention',
  linked: 'linked',
};

function RefusedBanner({ platform }: { readonly platform: GoogleClientPlatform }): ReactNode {
  const text = REFUSED_CLIENT[platform];
  return <Banner tone="critical" title={text.title} body={text.body} wrapBody />;
}

function AttentionBanner({
  account,
  subject,
  link,
}: {
  readonly account: GoogleAccountRow;
  readonly subject: string;
  readonly link: GoogleLinkState | null;
}): ReactNode {
  const text = problemText(account.problem, subject);
  return (
    <Banner
      tone="critical"
      title={text.title}
      body={text.body}
      wrapBody
      {...(link === null
        ? {}
        : {
            action: {
              label: 'Relink Google',
              icon: 'link',
              variant: 'filled',
              loading: link.busy,
              onPress: link.start,
            },
          })}
    />
  );
}

function LinkedBody({ account }: { readonly account: GoogleAccountRow }): ReactNode {
  const log = useGoogleSyncLog(account);
  const lists = syncedLists(account, useGoogleCollections()).length;
  return (
    <>
      {account.status === 'linked' ? (
        <GoogleStatusCard
          account={account}
          entries={log.data ?? []}
          calendars={account.calendar_ids.length}
          lists={lists}
        />
      ) : null}
      {GOOGLE_SERVICE_SECTIONS.map(({ id, Section }) => (
        <Section key={id} account={account} />
      ))}
      <GoogleSyncLog entries={log.data} failed={log.isError} personId={account.profile_id} />
    </>
  );
}

function Banners({
  account,
  own,
  who,
}: {
  readonly account: GoogleAccountRow | null;
  readonly own: GoogleLinkState | null;
  readonly who: string;
}): ReactNode {
  const refused = own === null ? null : own.refusedClient;
  return (
    <>
      {refused === null ? null : <RefusedBanner platform={refused} />}
      {account?.status === 'needs_attention' ? (
        <AttentionBanner account={account} subject={who} link={own} />
      ) : null}
      {account?.status === 'linking' ? (
        <Banner
          tone="info"
          title="Signing in to Google"
          body="Finish the sign-in in the browser."
        />
      ) : null}
    </>
  );
}

function UnlinkRow({ subject }: { readonly subject: GoogleSubject }): ReactNode {
  const { person, isMe } = subject;
  return (
    <List inset footer="Unlinking keeps every planner item.">
      <ActionRow
        icon="trash"
        title="Unlink Google"
        destructive
        onPress={() => {
          unlinkGoogleOf(person.id, isMe ? 'Google' : `${person.name}’s Google`);
        }}
      />
    </List>
  );
}

function AccountBody({
  account,
  own,
  name,
}: {
  readonly account: GoogleAccountRow | null;
  readonly own: GoogleLinkState | null;
  readonly name: string;
}): ReactNode {
  if (account === null || account.status === 'unlinked' || account.status === 'linking') {
    return <GoogleIntro link={own} subject={name} />;
  }
  return <LinkedBody account={account} />;
}

function GoogleBody({
  subject,
  link,
}: {
  readonly subject: GoogleSubject;
  readonly link: GoogleLinkState;
}): ReactNode {
  const { person, isMe, owner } = subject;
  const account = useGoogleAccountOf(person.id);
  const status = account === null ? 'unlinked' : account.status;
  const own = isMe ? link : null;
  const refused = own === null ? null : own.refusedClient;
  return (
    <SettingsFrame
      page="connections/google"
      title={isMe ? 'Google' : `Google · ${person.name}`}
      trail={[{ label: STATUS_DETAIL[status] }]}
    >
      <Banners account={account} own={own} who={isMe ? 'you' : person.name} />
      <AccountBody account={account} own={own} name={person.name} />
      {owner ? <GoogleAppCard refused={refused} /> : null}
      {status === 'unlinked' ? null : <UnlinkRow subject={subject} />}
    </SettingsFrame>
  );
}

function Missing(): ReactNode {
  return (
    <SettingsFrame page="connections/google" detail>
      <EmptyState
        icon="link"
        title="Not available"
        body="Only the owner can open another person’s Google account."
      />
    </SettingsFrame>
  );
}

export function GoogleScreen({ useLink }: { readonly useLink: UseGoogleLink }): ReactNode {
  const subject = useGoogleSubject();
  return subject === null ? <Missing /> : <LinkedSubject subject={subject} useLink={useLink} />;
}

function LinkedSubject({
  subject,
  useLink,
}: {
  readonly subject: GoogleSubject;
  readonly useLink: UseGoogleLink;
}): ReactNode {
  const link = useLink(subject.person.id);
  return <GoogleBody subject={subject} link={link} />;
}
