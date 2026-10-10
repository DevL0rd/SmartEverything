import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { href } from '../../app-shell/hrefs';
import { NavDirectory } from '../../app-shell/nav-directory';
import { PageHeader } from '../../components/page-header';
import { Screen } from '../../components/screen';
import { useSizeClass } from '../../design/size-class';

export function MoreScreen(): ReactNode {
  const { nav } = useSizeClass();
  if (nav !== 'bar') {
    return <Redirect href={href.home()} />;
  }
  return (
    <Screen header={<PageHeader title="More" back={false} />} maxWidth="reading">
      <NavDirectory />
    </Screen>
  );
}
