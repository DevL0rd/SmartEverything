import { STRING_TAGS, type OutOfBand, type StringKind } from './tags';

export type IppValue =
  | { readonly kind: 'integer'; readonly value: number }
  | { readonly kind: 'enum'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: StringKind; readonly value: string }
  | { readonly kind: 'octets'; readonly tag: number; readonly value: Uint8Array }
  | { readonly kind: 'dateTime'; readonly value: string }
  | { readonly kind: 'resolution'; readonly x: number; readonly y: number; readonly units: number }
  | { readonly kind: 'range'; readonly lower: number; readonly upper: number }
  | { readonly kind: 'collection'; readonly members: readonly IppAttribute[] }
  | { readonly kind: 'outOfBand'; readonly value: OutOfBand };

export interface IppAttribute {
  readonly name: string;
  readonly values: readonly IppValue[];
}

export interface IppGroup {
  readonly tag: number;
  readonly attributes: readonly IppAttribute[];
}

export interface IppMessage {
  readonly major: number;
  readonly minor: number;
  readonly code: number;
  readonly requestId: number;
  readonly groups: readonly IppGroup[];
  readonly data: Uint8Array;
}

export type IppStringValue = Extract<IppValue, { readonly kind: StringKind }>;

export function isStringValue(value: IppValue): value is IppStringValue {
  return Object.hasOwn(STRING_TAGS, value.kind);
}
