const ROW_HOOKS = new Map([
  ['useMyWatch', 'useHasMyWatch() or useMyWatchId() from features/watches'],
  ['useRow', 'a store selector that returns only the existence or the id of the row'],
  ['useDevice', 'useHasDevice from store/selectors, or a selector that returns only the id'],
]);

function rowHookOf(node) {
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    ROW_HOOKS.has(node.callee.name)
  ) {
    return node.callee.name;
  }
  return null;
}

function isNull(node) {
  return node.type === 'Literal' && node.value === null && node.raw === 'null';
}

const EQUALITY = new Set(['===', '!==', '==', '!=']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A hook that returns a whole row re-renders its caller on every update of that row. A caller that only checks the row for null re-renders for nothing; select the existence or the id instead.',
    },
    schema: [],
    messages: {
      exists:
        '{{hook}}() !== null subscribes to every update of the row only to learn whether it exists, so this component re-renders on each report. Use {{instead}}.',
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!EQUALITY.has(node.operator)) return;
        const hook = isNull(node.right)
          ? rowHookOf(node.left)
          : isNull(node.left)
            ? rowHookOf(node.right)
            : null;
        if (hook === null) return;
        context.report({ node, messageId: 'exists', data: { hook, instead: ROW_HOOKS.get(hook) } });
      },
    };
  },
};
