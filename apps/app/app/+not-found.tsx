import type { ReactNode } from 'react';
import { Redirect, usePathname } from 'expo-router';
import { href } from '../src/app-shell/hrefs';
import { legacyHref } from '../src/app-shell/legacy-routes';
import { Button } from '../src/components/button';
import { EmptyState } from '../src/components/empty-state';
import { PageShell } from '../src/components/page-shell/page-shell';

export default function NotFound(): ReactNode {
  const moved = legacyHref(
    usePathname()
      .split('/')
      .filter((part) => part !== ''),
  );
  if (moved !== null) {
    return <Redirect href={moved} />;
  }
  return (
    <PageShell title="Page not found" back={false}>
      <EmptyState
        icon="search"
        title="Page not found"
        body="This page does not exist."
        action={<Button label="Go home" href={href.home()} />}
      />
    </PageShell>
  );
}
