import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { View } from 'react-native';
import type { AppHref } from './app-href';
import { Icon } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export interface Crumb {
  readonly label: string;
  readonly href?: AppHref;
}

export function Breadcrumbs({ crumbs }: { readonly crumbs: readonly Crumb[] }): ReactNode {
  return (
    <View accessibilityRole="toolbar" className="min-w-0 flex-row items-center gap-1">
      {crumbs.map((crumb, index) => (
        <Fragment key={crumb.label}>
          {index === 0 ? null : (
            <View className="shrink-0">
              <Icon name="chevronRight" size={16} tone="faint" />
            </View>
          )}
          {crumb.href === undefined ? (
            <Text variant="callout" tone="default" numberOfLines={1} className="min-w-0 shrink">
              {crumb.label}
            </Text>
          ) : (
            <Interactive
              href={crumb.href}
              label={crumb.label}
              className="-my-2 min-w-0 shrink rounded-xs px-1 py-2"
              layerClassName="rounded-xs"
            >
              <Text variant="callout" tone="variant" numberOfLines={1}>
                {crumb.label}
              </Text>
            </Interactive>
          )}
        </Fragment>
      ))}
    </View>
  );
}
