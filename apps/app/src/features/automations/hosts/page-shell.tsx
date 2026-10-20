import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { links } from '../routes';

export function PageShell({
  title,
  back = true,
  children,
}: {
  readonly title: string;
  readonly back?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Screen maxWidth="reading" header={<PageHeader title={title} back={back} />}>
      {children}
    </Screen>
  );
}

export function NotFound({
  title,
  body,
}: {
  readonly title: string;
  readonly body: string;
}): ReactNode {
  return (
    <PageShell title="Automations">
      <EmptyState
        icon="alert"
        title={title}
        body={body}
        action={<Button label="All automations" href={links.list()} />}
      />
    </PageShell>
  );
}
