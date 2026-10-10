import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
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
  readonly onPress?: () => void;
  readonly href?: Href;
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
}: {
  readonly title: string;
  readonly icon: IconName | undefined;
  readonly action: ReactNode;
}): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-2">
      {icon === undefined ? null : <Icon name={icon} size={20} />}
      <Text variant="title-3" className="flex-1" numberOfLines={1}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function Card({
  title,
  icon,
  action,
  onPress,
  href,
  padding = 'card',
  tone = 'default',
  label,
  className,
  children,
}: CardProps): ReactNode {
  const frame = cn(
    'gap-3 rounded-lg elevation-1',
    padding === 'card' && 'p-card-pad',
    TONE[tone],
    className,
  );
  const content = (
    <>
      {title === undefined ? null : <CardHeader title={title} icon={icon} action={action} />}
      {children}
    </>
  );
  if (onPress === undefined && href === undefined) {
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
