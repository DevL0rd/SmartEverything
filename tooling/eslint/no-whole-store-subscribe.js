const STORE = 'EntityStore';

function isStore(type) {
  if (type.isUnion()) return type.types.some(isStore);
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  return symbol?.getName() === STORE;
}

function allowed(filename, allow) {
  const path = filename.replaceAll('\\', '/');
  return allow.some((entry) => path.endsWith(`/${entry}`) || path === entry);
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid whole-store EntityStore.subscribe in features and plugins; it runs on every live change of any slice.',
    },
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      wholeStore:
        'EntityStore.subscribe wakes on every live change, device state heartbeats included. Use store.subscribeSlices([...slices it reads], listener) so it wakes only when what it reads changes.',
    },
  },
  create(context) {
    const allow = context.options[0]?.allow ?? [];
    if (allowed(context.filename, allow)) return {};
    const services = context.sourceCode.parserServices;
    if (services?.program === undefined || services.program === null) {
      throw new Error(
        `no-whole-store-subscribe needs type information to find EntityStore in ${context.filename}`,
      );
    }
    const checker = services.program.getTypeChecker();
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || callee.property.name !== 'subscribe') return;
        const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(callee.object));
        if (isStore(type)) context.report({ node: callee, messageId: 'wholeStore' });
      },
    };
  },
};
