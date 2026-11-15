import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageShell } from '../../../components/page-shell/page-shell';

export function NotFound({
  title,
  body,
  action,
}: {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <PageShell title="Automations">
      <EmptyState
        icon="alert"
        title={title}
        body={body}
        action={action ?? <Button label="All automations" href={href.automations()} />}
      />
    </PageShell>
  );
}
