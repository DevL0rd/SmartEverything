import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useDevices } from '../../../store/selectors';
import type { EditorResult } from '../data/use-group-draft';
import { GroupEditor } from '../group-editor';

function finish(result: EditorResult): void {
  if (result.kind === 'saved') {
    router.replace(href.group(result.group.id));
    return;
  }
  if (router.canGoBack()) router.back();
  else router.replace(href.devices());
}

export function NewGroupScreen(): ReactNode {
  const devices = useDevices({ includeHidden: true });
  return (
    <Screen header={<PageHeader title="New group" back />}>
      <GroupEditor group={null} devices={devices} onClose={finish} />
    </Screen>
  );
}
