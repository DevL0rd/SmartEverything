import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { useIdiom } from '../../../../design/platform';
import { cn } from '../../../../design/cn';
import { groupsOf, type SourceChoice } from '../model/call-sources';

export interface SourcePickerProps {
  readonly open: boolean;
  readonly title: string;
  readonly subtitle: string;
  readonly choices: readonly SourceChoice[];
  readonly status: 'loading' | 'ready' | 'failed';
  readonly problem: string | null;
  readonly footnote: string | null;
  readonly empty: string;
  readonly onPick: (choice: SourceChoice) => void;
  readonly onClose: () => void;
}

function Thumb({
  choice,
  big,
}: {
  readonly choice: SourceChoice;
  readonly big: boolean;
}): ReactNode {
  const size = big ? 'h-11 w-16' : 'h-9 w-12';
  return (
    <View
      className={cn('items-center justify-center overflow-hidden rounded-sm bg-surface-3', size)}
    >
      {choice.thumbnail === null ? (
        <Icon name={choice.icon} size={20} tone="variant" />
      ) : (
        <Image
          resizeMethod="resize"
          source={{ uri: choice.thumbnail }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          className="size-full"
        />
      )}
    </View>
  );
}

function ChoiceRow({
  choice,
  big,
  onPick,
}: {
  readonly choice: SourceChoice;
  readonly big: boolean;
  readonly onPick: (choice: SourceChoice) => void;
}): ReactNode {
  const blocked = choice.unavailable !== null;
  return (
    <Interactive
      label={`${choice.title}, ${choice.unavailable ?? choice.subtitle}`}
      disabled={blocked}
      onPress={() => {
        onPick(choice);
      }}
      className="min-h-row-h flex-row items-center gap-3 px-4 py-2"
    >
      <Thumb choice={choice} big={big} />
      <View className="min-w-0 flex-1">
        <Text variant="body" numberOfLines={1}>
          {choice.title}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {choice.unavailable ?? choice.subtitle}
        </Text>
      </View>
      {blocked ? null : <Icon name="chevronRight" size={20} tone="faint" />}
    </Interactive>
  );
}

function PickerNotice({
  status,
  problem,
  empty,
  none,
}: {
  readonly status: SourcePickerProps['status'];
  readonly problem: string | null;
  readonly empty: string;
  readonly none: boolean;
}): ReactNode {
  if (status === 'loading') {
    return (
      <Text variant="callout" tone="variant" className="px-4 py-6" accessibilityLiveRegion="polite">
        Looking for screens and windows…
      </Text>
    );
  }
  if (status === 'failed') {
    return (
      <Text variant="callout" tone="critical" className="px-4 py-6">
        {`The list of screens and windows did not load. ${problem ?? ''}`.trim()}
      </Text>
    );
  }
  return none ? (
    <Text variant="callout" tone="variant" className="px-4 py-6">
      {empty}
    </Text>
  ) : null;
}

export function SourcePicker(props: SourcePickerProps): ReactNode {
  const { open, title, subtitle, choices, status, problem, footnote, empty, onPick, onClose } =
    props;
  const big = useIdiom() === 'pointer';
  return (
    <Sheet open={open} onClose={onClose} title={title} wide detents={['half', 'full']}>
      <View className="-mx-4 gap-2">
        <Text variant="callout" tone="variant" className="px-4">
          {subtitle}
        </Text>
        <PickerNotice status={status} problem={problem} empty={empty} none={choices.length === 0} />
        {groupsOf(choices).map(({ group, choices: rows }) => (
          <View key={group}>
            <Text variant="caption" tone="variant" className="px-4 pb-1 pt-3 uppercase">
              {group}
            </Text>
            {rows.map((choice) => (
              <ChoiceRow key={choice.key} choice={choice} big={big} onPick={onPick} />
            ))}
          </View>
        ))}
        {footnote === null ? null : (
          <View className="flex-row items-start gap-2 px-4 pt-3">
            <Icon name="shield" size={16} tone="variant" />
            <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
              {footnote}
            </Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}
