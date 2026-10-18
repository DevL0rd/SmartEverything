import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import type { ColourRole, Idiom } from '../../design/tokens';
import { cn } from '../../design/cn';
import { useIdiom } from '../../design/platform';
import { Glow } from '../glow';
import { Icon, type IconName } from '../icon';
import { IconWell } from '../icon-well';
import { Interactive } from '../interactive';
import { Text } from '../text';
import { frameClassOf } from './frame-class';
import { useWidgetFrame } from './widget-scope';
import { surfaceClassName } from './surface-class';

export { WIDGET_SURFACE } from './surface-class';

export interface WidgetFrameProps {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly href?: Href;
  readonly action?: ReactNode;
  readonly glow?: ColourRole | null;
  readonly children: ReactNode;
}

export function WidgetSurface({
  glow = null,
  className,
  children,
}: {
  readonly glow?: ColourRole | null;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className={cn(surfaceClassName(useWidgetFrame() !== null), className)}>
      {glow === null ? null : (
        <Glow colour={glow} x="85%" y="0%" radius="90%" strength={0.22} breathing />
      )}
      {children}
    </View>
  );
}

function headerHeight(idiom: Idiom): string {
  return idiom === 'touch' ? 'min-h-10' : 'min-h-8';
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
  const height = headerHeight(useIdiom());
  return (
    <View className={cn('flex-1 flex-row items-center gap-2', height)}>
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

function CompactHeader({
  icon,
  accent,
  title,
  href,
  action,
}: Pick<WidgetFrameProps, 'title' | 'icon' | 'accent' | 'href' | 'action'>): ReactNode {
  const height = headerHeight(useIdiom());
  const well = <IconWell icon={icon} colour={accent} size="s" />;
  return (
    <View className={cn('flex-row items-center justify-between gap-2', height)}>
      {href === undefined ? (
        well
      ) : (
        <Interactive
          href={href}
          label={`${title}, see all`}
          className="-m-1 rounded-sm p-1"
          layerClassName="rounded-sm"
        >
          {well}
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
  glow = null,
  children,
}: WidgetFrameProps): ReactNode {
  const frame = useWidgetFrame();
  const compact = frame !== null && frameClassOf(frame) === 's';
  const header = { title, icon, accent, action, ...(href === undefined ? {} : { href }) };
  return (
    <WidgetSurface glow={glow} className="gap-3 p-card-pad">
      {compact ? <CompactHeader {...header} /> : <WidgetHeader {...header} />}
      <View className={compact ? 'flex-1 justify-end gap-1' : 'flex-1'}>
        {compact ? (
          <Text variant="body-strong" numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {children}
      </View>
    </WidgetSurface>
  );
}
