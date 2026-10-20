import type { ViewStyle } from 'react-native';

export function flexStyle(flex: number, backgroundColor?: string): ViewStyle {
  return backgroundColor === undefined ? { flex } : { flex, backgroundColor };
}

export function boxStyle(width: number, height: number): ViewStyle {
  return { width, height };
}

export function leftStyle(left: number): ViewStyle {
  return { left };
}

export function tintStyle(backgroundColor: string, opacity: number): ViewStyle {
  return { backgroundColor, opacity };
}

export function fillStyle(flex: number, backgroundColor: string, opacity: number): ViewStyle {
  return { flex, backgroundColor, opacity };
}

export function heightStyle(height: number): ViewStyle {
  return { height };
}
