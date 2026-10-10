import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { Icon } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export interface Crumb {
  readonly label: string;
  readonly href?: Href;
}

export function Breadcrumbs({ crumbs }: { readonly crumbs: readonly Crumb[] }): ReactNode {
  return (
    <View accessibilityRole="toolbar" className="flex-row flex-wrap items-center gap-1">
      {crumbs.map((crumb, index) => (
        <Fragment key={crumb.label}>
          {index === 0 ? null : <Icon name="chevronRight" size={16} tone="faint" />}
          {crumb.href === undefined ? (
            <Text variant="callout" tone="default" numberOfLines={1}>
              {crumb.label}
            </Text>
          ) : (
            <Interactive
              href={crumb.href}
              label={crumb.label}
              className="rounded-xs px-1"
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
