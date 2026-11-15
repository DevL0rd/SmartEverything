const HOOK = 'useSyncExternalStore';

function isHook(node) {
  return (
    (node.type === 'Identifier' && node.name === HOOK) ||
    (node.type === 'Literal' && node.value === HOOK)
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid raw useSyncExternalStore in screens so every subscription pauses with its screen.',
    },
    schema: [],
    messages: {
      raw: 'Raw useSyncExternalStore ignores the screen pause, so paused screens keep re-rendering. Use usePausable from design/external-store or useStoreSelector from store/store-context so the subscription pauses with its screen.',
    },
  },
  create(context) {
    return {
      ImportSpecifier(node) {
        if (isHook(node.imported)) context.report({ node, messageId: 'raw' });
      },
      MemberExpression(node) {
        if (!node.computed && isHook(node.property)) context.report({ node, messageId: 'raw' });
      },
    };
  },
};
