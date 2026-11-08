import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from './app-href';
import { cn } from '../design/cn';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

type CardTone = 'default' | 'attention' | 'critical';

const TONE: Readonly<Record<CardTone, string>> = {
  default: 'bg-surface-1 border-hairline border-outline-variant',
  attention: 'bg-surface-1 border border-warning/40',
  critical: 'bg-surface-1 border border-critical/40',
};

export interface CardProps {
  readonly title?: string;
  readonly icon?: IconName;
  readonly action?: ReactNode;
  readonly metadata?: ReactNode;
  readonly onPress?: () => void;
  readonly href?: AppHref;
  readonly padding?: 'card' | 'none';
  readonly tone?: CardTone;
  readonly label?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

function CardHeader({
  title,
  icon,
  action,
  metadata,
  padded,
}: {
  readonly title: string;
  readonly icon: IconName | undefined;
  readonly action: ReactNode;
  readonly metadata: ReactNode;
  readonly padded: boolean;
}): ReactNode {
  const hasAction = action !== undefined && action !== null && typeof action !== 'boolean';
  return (
    <View
      className={cn('flex-row items-center gap-2', (!padded || hasAction) && 'min-h-touch-min')}
    >
      {icon === undefined ? null : <Icon name={icon} size={20} />}
      <Text variant="title-3" className="min-w-0 flex-1">
        {title}
      </Text>
      {metadata}
      {action}
    </View>
  );
}

export function Card({
  title,
  icon,
  action,
  metadata,
  onPress,
  href,
  padding = 'card',
  tone = 'default',
  label,
  className,
  children,
}: CardProps): ReactNode {
  const interactive = onPress !== undefined || href !== undefined;
  const padded = padding === 'card';
  const frame = cn(
    'gap-3 rounded-lg elevation-1',
    padded && 'p-card-pad',
    interactive && 'min-h-touch-min min-w-touch-min',
    TONE[tone],
    className,
  );
  const content = (
    <>
      {title === undefined ? null : (
        <CardHeader title={title} icon={icon} action={action} metadata={metadata} padded={padded} />
      )}
      {children}
    </>
  );
  if (!interactive) {
    return <View className={frame}>{content}</View>;
  }
  return (
    <Interactive
      onPress={onPress}
      href={href}
      label={label ?? title}
      className={frame}
      layerClassName="rounded-lg"
    >
      {content}
    </Interactive>
  );
}
