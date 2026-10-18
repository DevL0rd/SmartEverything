import type { NetworkClient } from '@smarteverything/domain';
import { useScreenInfiniteQuery } from '../../../queries/use-screen-query';
import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { clock } from '../../../format/time';
import { queryLogOptions } from '../../adguard/adguard-data';
import { OUTCOME_LOOK, OUTCOME_TEXT, plainDomain } from '../../adguard/query-outcome';
import { usePluginDevice } from '../../shared/use-plugin-device';
import { routerSectionHref } from '../overview/links';
import { lookupCaption, recentLookups } from './recent-lookups';

function DnsCard({
  address,
  blockerId,
}: {
  readonly address: string;
  readonly blockerId: string;
}): ReactNode {
  const log = useScreenInfiniteQuery(queryLogOptions(address, 'all'));
  const entries = recentLookups(log.data?.pages.flatMap((page) => page.entries) ?? [], address);
  const caption = lookupCaption(log.isSuccess, entries.length);
  return (
    <List title="DNS lookups" {...(caption === undefined ? {} : { caption })}>
      {entries.map((query) => (
        <ListRow
          key={`${query.time}|${query.domain}|${query.type}`}
          title={plainDomain(query.domain)}
          subtitle={`${clock(query.time)} · ${OUTCOME_TEXT[query.outcome]}`}
          icon={OUTCOME_LOOK[query.outcome].icon}
          iconTone={OUTCOME_LOOK[query.outcome].tone}
        />
      ))}
      {log.isError ? (
        <ListRow title="Can’t read lookups right now" icon="warning" iconTone="critical" />
      ) : null}
      <ListRow
        title="Open in query log"
        subtitle={address}
        icon="search"
        chevron
        href={routerSectionHref(blockerId, 'queries', { client: address })}
      />
    </List>
  );
}

export function ClientDns({ client }: { readonly client: NetworkClient }): ReactNode {
  const blocker = usePluginDevice('dns_filter');
  if (blocker === null || client.ip === null) {
    return null;
  }
  return <DnsCard address={client.ip} blockerId={blocker.id} />;
}
