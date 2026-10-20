import type { IppAttribute, IppValue } from './model';
import type { StringKind } from './tags';

function stringOf(kind: StringKind, value: string): IppValue {
  return { kind, value };
}

export const ipp = {
  integer: (value: number): IppValue => ({ kind: 'integer', value }),
  enumeration: (value: number): IppValue => ({ kind: 'enum', value }),
  boolean: (value: boolean): IppValue => ({ kind: 'boolean', value }),
  keyword: (value: string): IppValue => stringOf('keyword', value),
  text: (value: string): IppValue => stringOf('text', value),
  name: (value: string): IppValue => stringOf('name', value),
  uri: (value: string): IppValue => stringOf('uri', value),
  charset: (value: string): IppValue => stringOf('charset', value),
  language: (value: string): IppValue => stringOf('naturalLanguage', value),
  mimeType: (value: string): IppValue => stringOf('mimeMediaType', value),
  range: (lower: number, upper: number): IppValue => ({ kind: 'range', lower, upper }),
  collection: (members: readonly IppAttribute[]): IppValue => ({ kind: 'collection', members }),
} as const;

export function attribute(name: string, ...values: readonly IppValue[]): IppAttribute {
  return { name, values };
}

export function keywords(name: string, values: readonly string[]): IppAttribute {
  return { name, values: values.map((value) => ipp.keyword(value)) };
}
