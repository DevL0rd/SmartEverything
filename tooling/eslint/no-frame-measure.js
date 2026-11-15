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

function measuresIn(fn, visitorKeys) {
  const stack = [fn.body];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object' || typeof node.type !== 'string') continue;
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'measure'
    ) {
      return true;
    }
    for (const key of visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) stack.push(...child);
      else stack.push(child);
    }
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A frame callback that measures a view polls the layout every UI frame, even when nothing moved. React to the scroll offset, layout or motion values that can move the view instead.',
    },
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      frameMeasure:
        'useFrameCallback calls measure() on every frame. Re-measure in useAnimatedReaction on the scroll offset, layout or motion values that move the view, and in its onLayout.',
    },
  },
  create(context) {
    const allow = context.options[0]?.allow ?? [];
    const file = context.physicalFilename.replaceAll('\\', '/');
    if (allow.some((path) => file.endsWith(path))) return {};
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'useFrameCallback') return;
        const fn = functionOf(node.arguments[0], context.sourceCode.getScope(node));
        if (fn === null) return;
        if (!measuresIn(fn, context.sourceCode.visitorKeys)) return;
        context.report({ node, messageId: 'frameMeasure' });
      },
    };
  },
};
