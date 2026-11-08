import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import type { AppHref } from '../app-href';
import type { ColourRole } from '../../design/tokens';
import { cn } from '../../design/cn';
import { useIdiom } from '../../design/platform';
import { Glow } from '../glow';
import { Icon, type IconName } from '../icon';
import { IconWell } from '../icon-well';
import { Interactive } from '../interactive';
import { Text } from '../text';
import { ActionBand } from './action-band';
import { frameClassOf } from './frame-class';
import { useWidgetFrame } from './widget-scope';
import { surfaceClassName } from './surface-class';
import { WIDGET_BODY_GAP, widgetHeaderHeight } from './widget-frame-metrics';

export { WIDGET_SURFACE } from './surface-class';

const FRAME_STYLE = {
  touch: { minHeight: widgetHeaderHeight('touch') },
  pointer: { minHeight: widgetHeaderHeight('pointer') },
  body: { gap: WIDGET_BODY_GAP },
};

export interface WidgetFrameProps {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly href?: AppHref;
  readonly badge?: ReactNode;
  readonly actions?: ReactNode;
  readonly glow?: ColourRole | null;
  readonly children: ReactNode;
}

export function WidgetSurface({
  glow = null,
  className,
  style,
  children,
}: {
  readonly glow?: ColourRole | null;
  readonly className?: string;
  readonly style?: ViewStyle;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className={cn(surfaceClassName(useWidgetFrame() !== null), className)} style={style}>
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
  const headerStyle = FRAME_STYLE[useIdiom()];
  return (
    <View className="flex-1 flex-row items-center gap-2" style={headerStyle}>
      <IconWell icon={icon} colour={accent} size="s" />
      <Text variant="title-3" numberOfLines={1} className="shrink">
        {title}
      </Text>
      {link ? <Icon name="chevronRight" size={16} tone="faint" /> : null}
    </View>
  );
}

function Badge({ badge }: Pick<WidgetFrameProps, 'badge'>): ReactNode {
  return badge === undefined || badge === null ? null : (
    <View className="shrink-0" pointerEvents="none">
      {badge}
    </View>
  );
}

export function WidgetHeader({
  title,
  icon,
  accent,
  href,
  badge,
}: Pick<WidgetFrameProps, 'title' | 'icon' | 'accent' | 'href' | 'badge'>): ReactNode {
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
      <Badge badge={badge} />
    </View>
  );
}

function CompactHeader({
  icon,
  accent,
  title,
  href,
  badge,
}: Pick<WidgetFrameProps, 'title' | 'icon' | 'accent' | 'href' | 'badge'>): ReactNode {
  const headerStyle = FRAME_STYLE[useIdiom()];
  const well = <IconWell icon={icon} colour={accent} size="s" />;
  return (
    <View className="flex-row items-center justify-between gap-2" style={headerStyle}>
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
      <Badge badge={badge} />
    </View>
  );
}

export function WidgetFrame({
  title,
  icon,
  accent,
  href,
  badge,
  actions,
  glow = null,
  children,
}: WidgetFrameProps): ReactNode {
  const frame = useWidgetFrame();
  const compact = frame !== null && frameClassOf(frame) === 's';
  const header = { title, icon, accent, badge, ...(href === undefined ? {} : { href }) };
  return (
    <WidgetSurface glow={glow} className="p-card-pad" style={FRAME_STYLE.body}>
      {compact ? <CompactHeader {...header} /> : <WidgetHeader {...header} />}
      <View className={compact ? 'flex-1 justify-end gap-1' : 'flex-1'}>
        {compact ? (
          <Text variant="body-strong" numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {children}
        {actions === undefined ? null : <ActionBand>{actions}</ActionBand>}
      </View>
    </WidgetSurface>
  );
}
