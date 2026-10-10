import type { ReactNode } from 'react';
import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native';
import { cn } from '../design/cn';
import { TONE_TEXT, type Tone } from './tone';

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

export interface TextProps extends Omit<
  NativeTextProps,
  'children' | 'style' | 'className' | 'selectable'
> {
  readonly children?: ReactNode;
  readonly variant?: TextVariant;
  readonly tone?: Tone;
  readonly align?: keyof typeof ALIGN;
  readonly selectable?: boolean;
  readonly className?: string;
}

export function Text({
  variant = 'body',
  tone = 'default',
  align = 'start',
  selectable = false,
  className,
  ...rest
}: TextProps): ReactNode {
  return (
    <NativeText
      selectable={selectable}
      className={cn(VARIANT[variant], TONE_TEXT[tone], ALIGN[align], className)}
      {...rest}
    />
  );
}
