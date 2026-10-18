function isThenable(type) {
  if (type.getProperty('then') !== undefined) return true;
  return type.isUnion() && type.types.some(isThenable);
}

function unwrap(node) {
  let current = node;
  while (
    current.type === 'AwaitExpression' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'ChainExpression'
  ) {
    current = current.type === 'AwaitExpression' ? current.argument : current.expression;
  }
  return current;
}

function handlesRejection(node) {
  const call = unwrap(node);
  if (call.type !== 'CallExpression' || call.callee.type !== 'MemberExpression') return false;
  const { property } = call.callee;
  return property.type === 'Identifier' && property.name === 'catch' && call.arguments.length > 0;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A promise started and left running must go through background(promise, "noun.verb") so a rejection is logged with context. void hides it from no-floating-promises.',
    },
    schema: [],
    messages: {
      voidPromise:
        'void on a promise hides its rejection. Use background(promise, "noun.verb", { ... }) from @smarteverything/logging, or await it.',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (services?.program === undefined || services.program === null) return {};
    const checker = services.program.getTypeChecker();
    return {
      UnaryExpression(node) {
        if (node.operator !== 'void') return;
        if (handlesRejection(node.argument)) return;
        const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node.argument));
        if (isThenable(type)) context.report({ node, messageId: 'voidPromise' });
      },
    };
  },
};
