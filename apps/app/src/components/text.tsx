import type { ReactNode } from 'react';
import { memo } from 'react';
import { Text as NativeText, View, type TextProps as NativeTextProps } from 'react-native';
import { cn } from '../design/cn';
import { TONE_TEXT, type Tone } from './tone';
import { splitMiddle } from './text-middle';

export type TextVariant =
  | 'large-title'
  | 'title-1'
  | 'title-2'
  | 'title-3'
  | 'body'
  | 'body-strong'
  | 'callout'
  | 'footnote'
  | 'caption'
  | 'label';

const VARIANT: Readonly<Record<TextVariant, string>> = {
  'large-title': 'font-sans-semibold text-large-title tracking-tight',
  'title-1': 'font-sans-semibold text-title-1 tracking-tight',
  'title-2': 'font-sans-semibold text-title-2',
  'title-3': 'font-sans-semibold text-title-3',
  body: 'font-sans text-body',
  'body-strong': 'font-sans-medium text-body',
  callout: 'font-sans text-callout',
  footnote: 'font-sans text-footnote',
  caption: 'font-sans-medium text-caption',
  label: 'font-sans-medium text-label',
};

const ALIGN = { start: 'text-left', center: 'text-center', end: 'text-right' } as const;

interface TextBase {
  readonly variant?: TextVariant;
  readonly tone?: Tone;
  readonly align?: keyof typeof ALIGN;
  readonly selectable?: boolean;
  readonly className?: string;
}

interface Wrapped
  extends TextBase, Omit<NativeTextProps, 'style' | 'className' | 'selectable' | 'ellipsizeMode'> {
  readonly ellipsize?: undefined;
}

interface Middle extends TextBase {
  readonly children: string;
  readonly ellipsize: 'middle';
}

export type TextProps = Wrapped | Middle;

export const Text = memo(function Text({
  variant = 'body',
  tone = 'default',
  align = 'start',
  selectable = false,
  className,
  ellipsize,
  children,
  ...rest
}: TextProps): ReactNode {
  const style = cn(VARIANT[variant], TONE_TEXT[tone], ALIGN[align]);
  if (ellipsize === 'middle') {
    const { head, tail } = splitMiddle(children);
    return (
      <View
        accessible
        accessibilityLabel={children}
        className={cn('min-w-0 max-w-full flex-row', className)}
      >
        <NativeText
          aria-hidden
          selectable={selectable}
          numberOfLines={1}
          className={cn(style, 'shrink')}
        >
          {head}
        </NativeText>
        {tail === '' ? null : (
          <NativeText aria-hidden selectable={selectable} className={cn(style, 'shrink-0')}>
            {tail}
          </NativeText>
        )}
      </View>
    );
  }
  return (
    <NativeText selectable={selectable} className={cn(style, className)} {...rest}>
      {children}
    </NativeText>
  );
});
