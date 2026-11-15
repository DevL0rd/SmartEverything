import { createContext } from 'react';
import type { PortScope } from './literal-model';

export const NO_PORT_SCOPE: PortScope = { ports: {}, controls: {}, target: [], wholeHome: false };

export const PortScopeContext = createContext<PortScope>(NO_PORT_SCOPE);
