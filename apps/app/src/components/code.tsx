import type { ReactNode } from 'react';
import { ScrollView, Text as NativeText, View } from 'react-native';
import { cn } from '../design/cn';
import { CopyButton } from './copy-button';

export interface CodeBlockProps {
  readonly code: string;
  readonly label: string;
  readonly className?: string;
  readonly wrapLines?: boolean;
}

export function CodeBlock({ code, label, className, wrapLines = false }: CodeBlockProps): ReactNode {
  const body = (
    <NativeText selectable className="font-mono text-footnote text-on-surface">
      {code}
    </NativeText>
  );
  return (
    <View
      className={cn(
        'overflow-hidden rounded-md border-hairline border-outline-variant bg-surface-2',
        className,
      )}
    >
      <View className="flex-row items-center justify-between pl-3 pr-1">
        <NativeText
          className={cn(
            'font-sans-medium text-caption text-on-surface-variant',
            wrapLines && 'min-w-0 flex-1',
          )}
          selectable={wrapLines}
        >
          {label}
        </NativeText>
        <CopyButton value={code} label={`Copy ${label}`} />
      </View>
      {wrapLines ? (
        <View className="px-3 pb-3">{body}</View>
      ) : (
        <ScrollView horizontal className="grow-0" contentContainerClassName="px-3 pb-3">
          {body}
        </ScrollView>
      )}
    </View>
  );
}
