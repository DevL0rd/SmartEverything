import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ChatLink } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { SwitchTrack } from '../../../components/switch';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import { useSettingEnv } from '../../../settings/env';
import type { SwitchSetting } from '../../../settings/types';
import { sameJson } from '../../../store/same-json';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import { CHAT_SURFACE } from '../components/chat-surface';
import { linkView, mostSpecific, type LinkView } from './link-sources';

const LINE = 'h-full min-w-0 flex-1 flex-row items-center gap-3 pl-2 pr-3';

function LinkBody({
  view,
  trailing,
}: {
  readonly view: LinkView;
  readonly trailing: ReactNode;
}): ReactNode {
  return (
    <>
      <View aria-hidden className="size-10 items-center justify-center rounded-sm bg-primary/16">
        <Icon name={view.icon} size={20} tone="primary" />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {view.title}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {view.trail}
        </Text>
      </View>
      {trailing}
    </>
  );
}

function OpenTrail({ value }: { readonly value: string | null }): ReactNode {
  return (
    <View className="shrink-0 flex-row items-center gap-1">
      {value === null ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {value}
        </Text>
      )}
      <Icon name="chevronRight" size={16} tone="faint" />
    </View>
  );
}

function OpenLink({ view }: { readonly view: LinkView }): ReactNode {
  return (
    <Interactive
      label={`Open ${view.title}`}
      href={view.href}
      className={LINE}
      layerClassName="rounded-md"
    >
      <LinkBody view={view} trailing={<OpenTrail value={view.value} />} />
    </Interactive>
  );
}

function SwitchLink({
  view,
  setting,
}: {
  readonly view: LinkView;
  readonly setting: SwitchSetting;
}): ReactNode {
  const store = useEntityStore();
  const on = useStoreSelector((state) => setting.read(state), Object.is, [setting.id]);
  return (
    <Interactive
      label={view.title}
      role="switch"
      checked={on}
      onPress={() => {
        selectionTick();
        setting.write(!on, { state: store.get(), store }).catch((error: unknown) => {
          notify({ message: `${setting.title} was not changed`, error, tone: 'critical' });
        });
      }}
      className={LINE}
      layerClassName="rounded-md"
    >
      <LinkBody view={view} trailing={<SwitchTrack value={on} />} />
    </Interactive>
  );
}

function LinkCard({ view }: { readonly view: LinkView }): ReactNode {
  return (
    <View className={cn('h-14 w-full max-w-sm flex-row items-center', CHAT_SURFACE)}>
      {view.toggle === null ? (
        <OpenLink view={view} />
      ) : (
        <SwitchLink view={view} setting={view.toggle} />
      )}
    </View>
  );
}

export function LinkCards({ links }: { readonly links: readonly ChatLink[] }): ReactNode {
  const env = useSettingEnv();
  const views = useStoreSelector(
    (state) =>
      mostSpecific(
        links.flatMap((link) => {
          const view = linkView(link, state.tables, env);
          return view === null ? [] : [view];
        }),
      ),
    sameJson,
    [links, env.owner, env.platform, env.availability],
  );
  if (views.length === 0) {
    return null;
  }
  return (
    <View accessibilityLabel="Related" className="w-full gap-1">
      {views.map((view) => (
        <LinkCard key={view.key} view={view} />
      ))}
    </View>
  );
}
