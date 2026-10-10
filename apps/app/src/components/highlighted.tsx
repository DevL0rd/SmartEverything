import type { ReactNode } from 'react';
import { Text } from 'react-native';

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export function Highlighted({
  text,
  range,
}: {
  readonly text: string;
  readonly range: TextRange | null;
}): ReactNode {
  if (range === null || range.end <= range.start || range.end > text.length) {
    return text;
  }
  return (
    <>
      {text.slice(0, range.start)}
      <Text className="font-sans-medium text-primary">{text.slice(range.start, range.end)}</Text>
      {text.slice(range.end)}
    </>
  );
}
