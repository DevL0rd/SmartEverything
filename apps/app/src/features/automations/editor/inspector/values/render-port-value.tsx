import type { ReactNode } from 'react';
import { findByKey } from '@smarteverything/flow/program/lookup';
import { fieldOf } from '../schema-fields';
import type { InspectorEnv, ValueRequest, ValueSlot } from '../sections/section-types';
import { NO_PORT_SCOPE, PortScopeContext, type PortScope } from './literal-model';
import { PortValueField } from './port-value-field';
import { deviceScopeOf } from './device-scope';
import { useValueServices } from './value-services';

export function portScopeOf(env: InspectorEnv | null, nodeKey: string): PortScope {
  const node = env === null ? undefined : findByKey(env.index, nodeKey)?.node;
  if (env === null || node === undefined) return NO_PORT_SCOPE;
  const ports = node.ports ?? {};
  const inputs = env.registry.get(node.kind)?.inputs ?? [];
  return {
    ports,
    controls: Object.fromEntries(inputs.map((decl) => [decl.name, fieldOf(decl).control])),
    ...deviceScopeOf(
      inputs.map((decl) => decl.name),
      ports,
    ),
  };
}

function NodePorts({
  nodeKey,
  children,
}: {
  readonly nodeKey: string;
  readonly children: ReactNode;
}): ReactNode {
  const { env } = useValueServices();
  return <PortScopeContext value={portScopeOf(env, nodeKey)}>{children}</PortScopeContext>;
}

export const renderPortValue: ValueSlot = (request: ValueRequest): ReactNode => (
  <NodePorts key={`${request.nodeKey}:${request.slot}`} nodeKey={request.nodeKey}>
    <PortValueField request={request} />
  </NodePorts>
);
