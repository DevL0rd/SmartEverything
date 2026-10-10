import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon-glyphs';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WIDGET_SURFACE, WidgetHeader } from '../../../components/widget-board';
import type { ColourRole } from '../../../design/tokens';

export interface CostCardProps {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly href?: Href;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}

export function CostCard({
  title,
  icon,
  accent,
  href,
  action,
  children,
}: CostCardProps): ReactNode {
  return (
    <View className={`gap-3 p-card-pad ${WIDGET_SURFACE}`}>
      <WidgetHeader
        title={title}
        icon={icon}
        accent={accent}
        {...(href === undefined ? {} : { href })}
        {...(action === undefined ? {} : { action })}
      />
      {children}
    </View>
  );
}

export interface CardEmptyProps {
  readonly icon: IconName;
  readonly colour: ColourRole;
  readonly title: string;
  readonly body?: string;
  readonly action?: { readonly label: string; readonly href: Href };
}

export function CardEmpty({ icon, colour, title, body, action }: CardEmptyProps): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <IconWell icon={icon} colour={colour} size="m" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong">{title}</Text>
        {body === undefined ? null : (
          <Text variant="footnote" tone="variant">
            {body}
          </Text>
        )}
      </View>
      {action === undefined ? null : (
        <Button label={action.label} href={action.href} variant="tonal" />
      )}
    </View>
  );
}
