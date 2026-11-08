import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../../components/button';
import { ListRow } from '../../../../../components/list-row';
import { List } from '../../../../../components/section';
import type { OnErrorView } from './on-error-model';
import { ON_ERROR_COPY, armOps, hasOnError, onErrorView } from './on-error-model';
import type { SectionProps } from './section-types';

function Status({
  view,
  section,
}: {
  readonly view: OnErrorView;
  readonly section: SectionProps;
}): ReactNode {
  const { target } = view;
  if (target === undefined) {
    return (
      <ListRow
        title={view.statusText}
        icon="warning"
        {...(view.armed ? { subtitle: ON_ERROR_COPY.armedHint, wrapSubtitle: true } : {})}
      />
    );
  }
  return (
    <ListRow
      title={view.statusText}
      icon="arrowRight"
      chevron
      label={`Go to ${target.name}`}
      onPress={() => {
        section.actions.jump(target.id);
      }}
    />
  );
}

export function OnError(section: SectionProps): ReactNode {
  const { view, env, actions } = section;
  const node = env.graph.nodes.find((item) => item.id === view.id);
  if (node === undefined || !hasOnError(node.kind, env.registry)) return null;
  const model = onErrorView(env.graph, node, env.registry);
  return (
    <View className="gap-3">
      <List title={ON_ERROR_COPY.title} footer={ON_ERROR_COPY.fallback}>
        <Status view={model} section={section} />
      </List>
      {model.armed ? null : (
        <View className="self-start">
          <Button
            label={ON_ERROR_COPY.connect}
            icon="plus"
            variant="tonal"
            disabled={env.locked}
            onPress={() => {
              actions.apply(armOps(node));
            }}
          />
        </View>
      )}
      <List title={ON_ERROR_COPY.carries}>
        {model.values.map((row) => (
          <ListRow key={row.name} title={row.title} subtitle={row.description} wrapSubtitle />
        ))}
      </List>
    </View>
  );
}
