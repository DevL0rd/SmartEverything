import type { ReactNode } from 'react';
import type { AccessAuditRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useRows } from '../../../store/selectors';
import { useAccessAudit } from '../data/access-data';
import { auditSubtitle, auditViews } from '../model/audit';

function AuditRows({
  rows,
  title,
}: {
  readonly rows: readonly AccessAuditRow[];
  readonly title: string;
}): ReactNode {
  const profiles = useProfiles();
  const clients = useRows('clients');
  const views = auditViews(
    rows,
    new Map(profiles.map((profile) => [profile.id, profile.name])),
    new Map(clients.map((client) => [client.id, client.name])),
    useMinute(),
  );
  return (
    <List title={title} inset>
      {views.map((view) => (
        <ListRow
          key={view.id}
          title={view.look.title}
          subtitle={auditSubtitle(view)}
          caption={view.detail}
          wrapSubtitle
          icon={view.look.icon}
          iconTone={view.look.tone}
        />
      ))}
    </List>
  );
}

export function AuditList({
  limit,
  profileId,
  title,
}: {
  readonly limit: number;
  readonly profileId: string | null;
  readonly title: string;
}): ReactNode {
  const audit = useAccessAudit(limit, profileId);
  if (audit.isError) {
    return (
      <ErrorState
        error={audit.error}
        retry={() => {
          background(audit.refetch(), 'access.audit_refetch_failed');
        }}
      />
    );
  }
  if (audit.data === undefined) {
    return <Skeleton shape="block" className="h-24" />;
  }
  if (audit.data.length === 0) {
    return (
      <EmptyState
        icon="shield"
        title="Nothing refused yet"
        body="Refused requests and changes to access show up here."
      />
    );
  }
  return <AuditRows rows={audit.data} title={title} />;
}
