const SETTER = /^set[A-Z]/;

function functionOf(node, scope) {
  if (node === undefined) return null;
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return node;
  if (node.type !== 'Identifier') return null;
  let current = scope;
  while (current !== null) {
    const variable = current.set.get(node.name);
    if (variable !== undefined) {
      const [definition] = variable.defs;
      if (definition === undefined) return null;
      if (definition.node.type === 'FunctionDeclaration') return definition.node;
      if (definition.node.type === 'VariableDeclarator')
        return functionOf(definition.node.init ?? undefined, current);
      return null;
    }
    current = current.upper;
  }
  return null;
}

function setterIn(fn, visitorKeys) {
  const stack = [fn.body];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object' || typeof node.type !== 'string') continue;
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      SETTER.test(node.callee.name)
    ) {
      return node.callee.name;
    }
    for (const key of visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) stack.push(...child);
      else stack.push(child);
    }
  }
  return null;
}

function isInterval(callee) {
  if (callee.type === 'Identifier') return callee.name === 'setInterval';
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'setInterval'
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A component or hook interval that sets React state re-renders on a private timer that ignores the screen pause, focus and the background. Use the shared pausable clocks instead.',
    },
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      componentInterval:
        'setInterval calls {{setter}} and re-renders on its own timer, even while the screen is paused or in the background. Read the time with useSecondOf((now) => ...) or useMinuteOf((now) => ...) from store/clock instead.',
    },
  },
  create(context) {
    const allow = context.options[0]?.allow ?? [];
    const file = context.physicalFilename.replaceAll('\\', '/');
    if (allow.some((path) => file.endsWith(path))) return {};
    return {
      CallExpression(node) {
        if (!isInterval(node.callee)) return;
        const fn = functionOf(node.arguments[0], context.sourceCode.getScope(node));
        if (fn === null) return;
        const setter = setterIn(fn, context.sourceCode.visitorKeys);
        if (setter === null) return;
        context.report({ node, messageId: 'componentInterval', data: { setter } });
      },
    };
  },
};
