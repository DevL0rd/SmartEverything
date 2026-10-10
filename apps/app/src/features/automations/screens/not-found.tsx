import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';

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
    <Screen maxWidth="reading" header={<PageHeader title="Automations" />}>
      <EmptyState
        icon="alert"
        title={title}
        body={body}
        action={action ?? <Button label="All automations" href={href.automations()} />}
      />
    </Screen>
  );
}
