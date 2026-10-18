import type { KeyboardTypeOptions, TextInputProps } from 'react-native';

export type FieldKind = 'text' | 'email' | 'password' | 'url' | 'number' | 'code';

interface KindProps {
  readonly keyboardType: KeyboardTypeOptions;
  readonly autoCapitalize: TextInputProps['autoCapitalize'];
  readonly autoComplete: TextInputProps['autoComplete'];
  readonly mono: boolean;
}

export const FIELD_KINDS: Readonly<Record<FieldKind, KindProps>> = {
  text: { keyboardType: 'default', autoCapitalize: 'sentences', autoComplete: 'off', mono: false },
  email: {
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoComplete: 'email',
    mono: false,
  },
  password: {
    keyboardType: 'default',
    autoCapitalize: 'none',
    autoComplete: 'password',
    mono: false,
  },
  url: { keyboardType: 'url', autoCapitalize: 'none', autoComplete: 'url', mono: true },
  number: { keyboardType: 'decimal-pad', autoCapitalize: 'none', autoComplete: 'off', mono: false },
  code: {
    keyboardType: 'visible-password',
    autoCapitalize: 'none',
    autoComplete: 'off',
    mono: true,
  },
};
