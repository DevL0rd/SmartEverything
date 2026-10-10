import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ChatLink } from '@smarteverything/domain';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { SwitchTrack } from '../../../components/switch';
import { notify } from '../../../components/toast-store';
import { WIDGET_SURFACE } from '../../../components/widget-board';
import { selectionTick } from '../../../platform/haptics';
import { useSettingEnv } from '../../../settings/env';
import type { SwitchSetting } from '../../../settings/types';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import { Overline } from '../components/overline';
import { linkView, mostSpecific, type LinkView } from './link-sources';

function LinkRow({ view }: { readonly view: LinkView }): ReactNode {
  return (
    <ListRow
      title={view.title}
      subtitle={view.trail}
      leading={<IconWell icon={view.icon} colour="primary" />}
      {...(view.value === null ? {} : { value: view.value })}
      chevron
      href={view.href}
      label={`Open ${view.title}`}
    />
  );
}

function SwitchLinkRow({
  view,
  setting,
}: {
  readonly view: LinkView;
  readonly setting: SwitchSetting;
}): ReactNode {
  const store = useEntityStore();
  const on = useStoreSelector((state) => setting.read(state), Object.is, [setting.id]);
  return (
    <ListRow
      title={view.title}
      subtitle={view.trail}
      leading={<IconWell icon={view.icon} colour="primary" />}
      label={view.title}
      role="switch"
      checked={on}
      onPress={() => {
        selectionTick();
        setting.write(!on, { state: store.get(), store }).catch((error: unknown) => {
          notify({ message: `${setting.title} was not changed`, error, tone: 'critical' });
        });
      }}
      trailing={<SwitchTrack value={on} />}
    />
  );
}

function RelatedRow({
  view,
  first,
}: {
  readonly view: LinkView;
  readonly first: boolean;
}): ReactNode {
  return (
    <View>
      {first ? null : <View className="mx-4 h-px bg-outline-variant" />}
      {view.toggle === null ? (
        <LinkRow view={view} />
      ) : (
        <SwitchLinkRow view={view} setting={view.toggle} />
      )}
    </View>
  );
}

export function LinkCards({ links }: { readonly links: readonly ChatLink[] }): ReactNode {
  const tables = useStoreSelector((state) => state.tables);
  const env = useSettingEnv();
  const views = mostSpecific(
    links.flatMap((link) => {
      const view = linkView(link, tables, env);
      return view === null ? [] : [view];
    }),
  );
  if (views.length === 0) {
    return null;
  }
  return (
    <View className={WIDGET_SURFACE}>
      <Overline className="px-4 pb-1 pt-3">Related</Overline>
      {views.map((view, index) => (
        <RelatedRow key={view.key} view={view} first={index === 0} />
      ))}
    </View>
  );
}
