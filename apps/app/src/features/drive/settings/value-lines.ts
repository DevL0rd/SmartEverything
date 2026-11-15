import { useIsPhone } from '../../../design/size-class';

export interface ValueLines {
  readonly subtitle: string;
  readonly value?: string;
  readonly caption?: string;
}

export function valueLinesOf(stacked: boolean, value: string, subtitle: string): ValueLines {
  return stacked ? { subtitle: value, caption: subtitle } : { subtitle, value };
}

export function useStackedValue(): boolean {
  return useIsPhone();
}
