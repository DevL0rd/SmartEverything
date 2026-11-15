import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageShell } from '../../../components/page-shell/page-shell';
import { href } from '../../../app-shell/hrefs';

export function MissingDevice(): ReactNode {
  return (
    <PageShell title="Device">
      <EmptyState
        icon="alert"
        title="This device isn't in your home"
        body="It may have been removed by its provider."
        action={<Button label="Go home" href={href.home()} />}
      />
    </PageShell>
  );
}
