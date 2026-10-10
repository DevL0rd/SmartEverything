import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { href } from '../../../app-shell/hrefs';

export function MissingDevice(): ReactNode {
  return (
    <Screen header={<PageHeader title="Device" />} maxWidth="reading">
      <EmptyState
        icon="alert"
        title="This device isn't in your home"
        body="It may have been removed by its provider."
        action={<Button label="Go home" href={href.home()} />}
      />
    </Screen>
  );
}
