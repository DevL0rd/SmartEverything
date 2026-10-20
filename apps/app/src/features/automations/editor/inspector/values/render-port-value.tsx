import type { ReactNode } from 'react';
import type { ValueRequest, ValueSlot } from '../sections/section-types';
import { PortValueField } from './port-value-field';

export const renderPortValue: ValueSlot = (request: ValueRequest): ReactNode => (
  <PortValueField key={`${request.nodeKey}:${request.slot}`} request={request} />
);
