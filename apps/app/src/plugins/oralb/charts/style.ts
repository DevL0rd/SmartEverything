import type { ViewStyle } from 'react-native';

export function marginLeftStyle(marginLeft: number): ViewStyle {
  return { marginLeft };
}

export function offsetStyle(left: number, top: number): ViewStyle {
  return { position: 'absolute', left, top };
}

export function widthStyle(width: number): ViewStyle {
  return { width };
}

export function sizeStyle(width: number, height: number): ViewStyle {
  return { width, height };
}

export function growStyle(flex: number): ViewStyle {
  return { flex };
}

export function borderColorStyle(borderColor: string): ViewStyle {
  return { borderColor };
}
