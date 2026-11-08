import { assignmentAdvice, typeDisplayName } from '@smarteverything/domain';
import { entriesOf, shapeOf } from './shapes';
import type { Finding, LintInput } from './lint-types';
import { finding } from './lint-types';
import { subjectOf } from './lint-scan';
import { typeOfValue } from './types';

export function linkAdviceFindings(input: LintInput): readonly Finding[] {
  const { index, ctx, typed, program } = input;
  return entriesOf(index).flatMap((entry) => {
    const shape = shapeOf(entry, program, ctx);
    if (shape === undefined) return [];
    return shape.inputs.flatMap((decl) => {
      const value = entry.node.ports?.[decl.name];
      if (value === undefined || 'lit' in value) return [];
      const typing = typeOfValue(value, typed);
      if (typing.kind !== 'type') return [];
      const advice = assignmentAdvice(typing.type, decl.type);
      if (advice === null) return [];
      return [
        finding('link_advice', subjectOf(entry.node), advice, {
          port: decl.name,
          expected: typeDisplayName(decl.type),
          received: typeDisplayName(typing.type),
        }),
      ];
    });
  });
}
