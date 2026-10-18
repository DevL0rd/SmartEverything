import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import type { Href } from 'expo-router';
import { Interactive } from './interactive';
import { rowsOf, separatorInset } from './list-rows';
import { Text } from './text';

export interface SectionProps {
  readonly title?: string;
  readonly caption?: string;
  readonly footer?: string;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

function SectionTitle({
  title,
  caption,
  action,
}: {
  readonly title: string;
  readonly caption: string | undefined;
  readonly action: ReactNode;
}): ReactNode {
  return (
    <View className="min-h-8 flex-row items-end justify-between gap-2 px-4">
      <View className="flex-1 flex-row items-end gap-2">
        <Text variant="footnote" tone="variant" accessibilityRole="header" className="pb-1">
          {title}
        </Text>
        {caption === undefined ? null : (
          <Text variant="footnote" tone="variant" className="pb-1">
            {caption}
          </Text>
        )}
      </View>
      {action}
    </View>
  );
}

export function SectionAction({
  label,
  href,
  onPress,
}: {
  readonly label: string;
  readonly href?: Href;
  readonly onPress?: () => void;
}): ReactNode {
  return (
    <Interactive
      role="link"
      label={label}
      href={href}
      onPress={onPress}
      className="-mr-2 min-h-touch-min justify-end rounded-sm px-2 pb-1"
    >
      <Text variant="footnote" tone="primary">
        {label}
      </Text>
    </Interactive>
  );
}

export function Section({
  title,
  caption,
  footer,
  action,
  className,
  children,
}: SectionProps): ReactNode {
  return (
    <View className={cn('gap-1', className)}>
      {title === undefined ? null : (
        <SectionTitle title={title} caption={caption} action={action} />
      )}
      {children}
      {footer === undefined ? null : (
        <Text variant="footnote" tone="variant" className="px-4 pt-1">
          {footer}
        </Text>
      )}
    </View>
  );
}

export interface ListProps extends SectionProps {
  readonly inset?: boolean;
}

export function List({ inset = false, children, ...section }: ListProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const rows = rowsOf(children);
  return (
    <Section {...section}>
      <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index === 0 ? null : (
              <View
                className={cn('h-hairline bg-outline-variant', separatorInset(row, inset, pointer))}
              />
            )}
            {row}
          </Fragment>
        ))}
      </View>
    </Section>
  );
}
