import { createContext } from 'react';
import type { RailHost } from './rail-host';

export const RailHostContext = createContext<RailHost | null>(null);
