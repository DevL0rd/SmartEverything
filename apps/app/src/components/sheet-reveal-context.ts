import { createContext } from 'react';
import type { View } from 'react-native';

export const SheetRevealContext = createContext<((node: View | null) => void) | null>(null);
