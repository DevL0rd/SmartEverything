import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import type { ColourRole } from '../../design/tokens';
import { Glow } from '../glow';
import { Icon, type IconName } from '../icon';
import { IconWell } from '../icon-well';
import { Interactive } from '../interactive';
import { Text } from '../text';
import type { WidgetSize } from './types';

export const WIDGET_SURFACE =
  'overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1';

export interface WidgetFrameProps {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly href?: Href;
  readonly action?: ReactNode;
  readonly size: WidgetSize;
  readonly glow?: ColourRole | null;
  readonly children: ReactNode;
}

export function WidgetSurface({
  glow = null,
  children,
}: {
  readonly glow?: ColourRole | null;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className={`h-full ${WIDGET_SURFACE}`}>
      {glow === null ? null : (
        <Glow colour={glow} x="85%" y="0%" radius="90%" strength={0.22} breathing />
      )}
      {children}
    </View>
  );
}

function Title({
  title,
  icon,
  accent,
  link,
}: {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly link: boolean;
}): ReactNode {
  return (
    <View className="min-h-8 flex-1 flex-row items-center gap-2">
      <IconWell icon={icon} colour={accent} size="s" />
      <Text variant="title-3" numberOfLines={1} className="shrink">
        {title}
      </Text>
      {link ? <Icon name="chevronRight" size={16} tone="faint" /> : null}
    </View>
  );
}

export function WidgetHeader({
  title,
  icon,
  accent,
  href,
  action,
}: Pick<WidgetFrameProps, 'title' | 'icon' | 'accent' | 'href' | 'action'>): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      {href === undefined ? (
        <Title title={title} icon={icon} accent={accent} link={false} />
      ) : (
        <Interactive
          href={href}
          label={`${title}, see all`}
          className="-mx-1 flex-1 rounded-sm px-1"
          layerClassName="rounded-sm"
        >
          <Title title={title} icon={icon} accent={accent} link />
        </Interactive>
      )}
      {action}
    </View>
  );
}

export function WidgetFrame({
  title,
  icon,
  accent,
  href,
  action,
  size,
  glow = null,
  children,
}: WidgetFrameProps): ReactNode {
  return (
    <WidgetSurface glow={glow}>
      <View className="flex-1 gap-3 p-card-pad">
        <WidgetHeader
          title={title}
          icon={icon}
          accent={accent}
          action={action}
          {...(href === undefined ? {} : { href })}
        />
        <View className={size === 'S' ? 'flex-1 justify-end' : 'flex-1'}>{children}</View>
      </View>
    </WidgetSurface>
  );
}
