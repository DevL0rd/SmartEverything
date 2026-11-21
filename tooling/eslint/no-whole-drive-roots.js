function tableOf(node) {
  const [first] = node.arguments;
  if (first === undefined) return null;
  if (first.type === 'Literal' && typeof first.value === 'string') return first.value;
  if (first.type === 'TemplateLiteral' && first.expressions.length === 0) {
    return first.quasis[0].value.cooked;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'useDriveRoots() and useRows("drive_roots") return a new array on every drive totals update, which arrives once per indexed or backed up file. Only the usage, storage and indexing views show those totals; everything else reads useDriveRootPlaces(), useDriveRoot(id) or useDriveRootBytes(id).',
    },
    schema: [],
    messages: {
      whole:
        '{{hook}} re-renders this component on every drive items, folders or bytes change. Use useDriveRootPlaces() for ids, names, ownership and state, useDriveRoot(id) for one drive, or useDriveRootBytes(id) for its size.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return;
        const { name } = node.callee;
        if (name === 'useDriveRoots') {
          context.report({ node, messageId: 'whole', data: { hook: 'useDriveRoots()' } });
          return;
        }
        if (name === 'useRows' && tableOf(node) === 'drive_roots') {
          context.report({ node, messageId: 'whole', data: { hook: "useRows('drive_roots')" } });
        }
      },
    };
  },
};
