const STORE = 'EntityStore';

function isStore(type) {
  if (type.isUnion()) return type.types.some(isStore);
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  return symbol?.getName() === STORE;
}

function pathOf(filename) {
  return filename.replaceAll('\\', '/');
}

function allowed(filename, allow) {
  const path = pathOf(filename);
  return allow.some((entry) => path.endsWith(`/${entry}`) || path === entry);
}

function within(filename, folders) {
  const path = pathOf(filename);
  return folders.some((folder) => path.includes(`/${folder}`) || path.startsWith(folder));
}

function isDeviceListHook(node) {
  return node.callee.type === 'Identifier' && node.callee.name === 'useDevices';
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid whole-store EntityStore.subscribe in the app; it runs on every live change of any slice.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
          deviceListIn: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      wholeStore:
        'EntityStore.subscribe wakes on every live change, device state heartbeats included. Use store.subscribeSlices([...slices it reads], listener) so it wakes only when what it reads changes.',
      deviceList:
        'useDevices() returns a new array whenever any device row changes, last-seen and sync times included, so this map code re-renders the whole map on every device heartbeat. Select only the fields it reads with an equality function (features/home-map/data/map-devices.ts, useDeviceNames or useMatchingDevices).',
    },
  },
  create(context) {
    const allow = context.options[0]?.allow ?? [];
    const deviceListIn = context.options[0]?.deviceListIn ?? [];
    const bansDeviceList = within(context.filename, deviceListIn);
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
        if (bansDeviceList && isDeviceListHook(node)) {
          context.report({ node, messageId: 'deviceList' });
          return;
        }
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || callee.property.name !== 'subscribe') return;
        const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(callee.object));
        if (isStore(type)) context.report({ node: callee, messageId: 'wholeStore' });
      },
    };
  },
};
