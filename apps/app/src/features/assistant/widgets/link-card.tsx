import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ChatLink } from '@smarteverything/domain';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { WIDGET_SURFACE } from '../../../components/widget-board';
import { useSettingEnv } from '../../../settings/env';
import { useStoreSelector } from '../../../store/store-context';
import { linkView, mostSpecific, type LinkView } from './link-sources';

function LinkCard({ view }: { readonly view: LinkView }): ReactNode {
  return (
    <View className={WIDGET_SURFACE}>
      <ListRow
        title={view.title}
        subtitle={view.trail}
        leading={<IconWell icon={view.icon} colour="primary" />}
        {...(view.value === null ? {} : { value: view.value })}
        chevron
        href={view.href}
        label={`Open ${view.title}`}
      />
    </View>
  );
}

export function LinkCards({ links }: { readonly links: readonly ChatLink[] }): ReactNode {
  const tables = useStoreSelector((state) => state.tables);
  const env = useSettingEnv();
  const views = links.flatMap((link) => {
    const view = linkView(link, tables, env);
    return view === null ? [] : [view];
  });
  return mostSpecific(views).map((view) => <LinkCard key={view.key} view={view} />);
}
