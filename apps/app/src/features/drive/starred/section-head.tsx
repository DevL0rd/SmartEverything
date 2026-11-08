import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';

export interface SectionHeadProps {
  readonly title: string;
  readonly note: string;
  readonly detail?: string;
}

export function SectionHead({ title, note, detail }: SectionHeadProps): ReactNode {
  return (
    <View className="flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1">
      <Text variant="body-strong" role="heading">
        {title}
      </Text>
      <Text variant="footnote" tone="variant" className="min-w-0 shrink">
        {note}
      </Text>
      {detail === undefined ? null : (
        <Text variant="footnote" tone="variant" className="tabular ml-auto">
          {detail}
        </Text>
      )}
    </View>
  );
}

function Heading({
  text,
  className,
}: {
  readonly text: string;
  readonly className: string;
}): ReactNode {
  return (
    <Text variant="caption" tone="variant" numberOfLines={1} className={className}>
      {text}
    </Text>
  );
}

export function StarredColumns(): ReactNode {
  return (
    <View className="flex-row items-center gap-4 border-b border-outline-variant bg-surface-2 px-4 py-1.5">
      <Heading text="Name" className="min-w-0 flex-1 pl-12" />
      <Heading text="In" className="w-56" />
      <Heading text="Changed" className="w-20 text-right" />
      <Heading text="Size" className="w-20 text-right" />
      <View className="w-control-h" />
    </View>
  );
}
