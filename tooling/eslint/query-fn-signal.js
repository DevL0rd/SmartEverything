function keyName(property) {
  if (property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }
  return null;
}

function isFunction(node) {
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function signalBinding(pattern) {
  if (pattern.type !== 'ObjectPattern') return null;
  for (const entry of pattern.properties) {
    if (entry.type !== 'Property' || keyName(entry) !== 'signal') continue;
    const target = entry.value.type === 'AssignmentPattern' ? entry.value.left : entry.value;
    return target.type === 'Identifier' ? target : null;
  }
  return null;
}

function resolvedFunction(sourceCode, node) {
  let scope = sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.set.get(node.name);
    if (variable !== undefined) {
      for (const definition of variable.defs) {
        if (definition.type === 'FunctionName') return definition.node;
        if (
          definition.type === 'Variable' &&
          definition.node.init !== null &&
          isFunction(definition.node.init)
        ) {
          return definition.node.init;
        }
      }
      return null;
    }
    scope = scope.upper;
  }
  return null;
}

function takesNothing(services, node) {
  if (services?.program === undefined || services.program === null) return false;
  const checker = services.program.getTypeChecker();
  const signatures = checker
    .getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node))
    .getCallSignatures();
  return (
    signatures.length > 0 && signatures.every((signature) => signature.parameters.length === 0)
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A TanStack queryFn must destructure and use the abort signal, so a cancelled or superseded query aborts its request instead of leaving it running.',
    },
    schema: [],
    messages: {
      noSignal:
        'This queryFn ignores the abort signal. Write it as ({ signal }) => read(..., signal) (or ({ pageParam, signal }) for pages) and pass signal to the request.',
      unusedSignal:
        'This queryFn takes signal but never passes it on. Forward it to the request so a cancelled query aborts it.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    function check(fn, reportAt) {
      const first = fn.params[0];
      const binding = first === undefined ? null : signalBinding(first);
      if (binding === null) {
        context.report({ node: reportAt, messageId: 'noSignal' });
        return;
      }
      const variable = sourceCode
        .getDeclaredVariables(fn)
        .find((declared) => declared.identifiers.includes(binding));
      if (variable === undefined || variable.references.length === 0) {
        context.report({ node: reportAt, messageId: 'unusedSignal' });
      }
    }

    function inspect(value, reportAt) {
      if (value.type === 'ConditionalExpression') {
        inspect(value.consequent, reportAt);
        inspect(value.alternate, reportAt);
        return;
      }
      if (isFunction(value)) {
        check(value, value);
        return;
      }
      if (value.type === 'Identifier' || value.type === 'MemberExpression') {
        const fn = value.type === 'Identifier' ? resolvedFunction(sourceCode, value) : null;
        if (fn !== null) {
          check(fn, reportAt);
          return;
        }
        if (takesNothing(sourceCode.parserServices, value)) {
          context.report({ node: reportAt, messageId: 'noSignal' });
        }
      }
    }

    return {
      Property(node) {
        if (keyName(node) !== 'queryFn') return;
        if (node.parent.type !== 'ObjectExpression') return;
        inspect(node.value, node.value);
      },
    };
  },
};
