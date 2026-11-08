import {
  AUTOMATION_V4,
  FUNCTION_V4,
  type AutomationV3,
  type AutomationV4,
  type FunctionV3,
  type FunctionV4,
  type NodeKindLookup,
} from '@smarteverything/domain';
import { unstructure } from '@smarteverything/flow/graph/unstructure';

export function graphAutomation(tree: AutomationV3, kinds: NodeKindLookup): AutomationV4 {
  return AUTOMATION_V4.parse(unstructure(tree, kinds));
}

export function graphFunction(tree: FunctionV3, kinds: NodeKindLookup): FunctionV4 {
  return FUNCTION_V4.parse(unstructure(tree, kinds));
}
