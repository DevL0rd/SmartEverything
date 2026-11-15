const SLICES = new Set(['map', 'find', 'some', 'filter']);

function isDeviceListCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'useDevices'
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'useDevices() returns a new array whenever any device row changes. A caller that only derives names, ids or one device from it re-renders on every unrelated device change; select that value with useDeviceNames, useDeviceIds, useFirstDevice, useHasDevice or useMatchingDevices instead.',
    },
    schema: [],
    messages: {
      slice:
        'useDevices(...).{{method}}(...) subscribes to the whole device list to derive a small value, so this component re-renders on every device row change. Use useDeviceNames, useDeviceIds, useFirstDevice, useHasDevice or useMatchingDevices from store/selectors.',
      map: 'new Map(useDevices(...)...) rebuilds a lookup on every device row change. Use useDeviceNames(field) from store/selectors.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isDeviceListCall(node)) return;
        const parent = node.parent;
        if (
          parent.type === 'MemberExpression' &&
          parent.object === node &&
          parent.property.type === 'Identifier' &&
          SLICES.has(parent.property.name)
        ) {
          context.report({ node, messageId: 'slice', data: { method: parent.property.name } });
        }
      },
      NewExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'Map') return;
        const [first] = node.arguments;
        if (first === undefined) return;
        let current = first;
        while (current.type === 'CallExpression' && current.callee.type === 'MemberExpression') {
          current = current.callee.object;
        }
        if (isDeviceListCall(current)) context.report({ node, messageId: 'map' });
      },
    };
  },
};
