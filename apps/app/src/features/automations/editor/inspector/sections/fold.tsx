import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../../../components/disclosure';
import { Icon, type IconName } from '../../../../../components/icon';
import { Interactive } from '../../../../../components/interactive';
import { Text } from '../../../../../components/text';
import { cn } from '../../../../../design/cn';

export interface FoldProps {
  readonly title: string;
  readonly summary: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly icon?: IconName;
  readonly raised?: boolean;
  readonly children: ReactNode;
}

export function Fold({
  title,
  summary,
  open,
  onToggle,
  icon,
  raised = false,
  children,
}: FoldProps): ReactNode {
  return (
    <CollapseRoot className="gap-2">
      <View className="px-4">
        <Interactive
          label={title}
          hint={summary}
          expanded={open}
          onPress={onToggle}
          className={cn(
            'min-h-touch-min flex-row items-center gap-3 rounded-md px-3 py-2',
            raised && 'border border-outline-variant bg-surface-2',
          )}
          layerClassName="rounded-md"
        >
          {icon === undefined ? null : <Icon name={icon} size={20} tone="variant" />}
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant={raised ? 'body-strong' : 'label'}>{title}</Text>
            <Text variant="footnote" tone="variant" numberOfLines={2}>
              {summary}
            </Text>
          </View>
          <TurnChevron open={open} />
        </Interactive>
      </View>
      {open ? <CollapseBody className="gap-5">{children}</CollapseBody> : null}
    </CollapseRoot>
  );
}
