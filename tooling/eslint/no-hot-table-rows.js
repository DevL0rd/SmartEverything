const HOT_TABLES = new Set([
  'devices',
  'automations',
  'automation_runs',
  'clients',
  'health_daily',
]);

const WHOLE_LISTS = new Set(['useDevices', 'useAutomations']);

const LOOKUPS = new Set(['find', 'some', 'every', 'length', 'findIndex', 'includes']);

function tableOf(node) {
  const [first] = node.arguments;
  if (first === undefined) return null;
  if (first.type === 'Literal' && typeof first.value === 'string') return first.value;
  if (first.type === 'TemplateLiteral' && first.expressions.length === 0) {
    return first.quasis[0].value.cooked;
  }
  return null;
}

function propertyName(member) {
  if (member.computed || member.property.type !== 'Identifier') return null;
  return member.property.name;
}

function isLookupMember(node) {
  const { parent } = node;
  if (parent?.type !== 'MemberExpression' || parent.object !== node) return false;
  const name = propertyName(parent);
  if (name === null) return false;
  if (LOOKUPS.has(name)) return true;
  if (name !== 'byId') return false;
  const next = parent.parent;
  return (
    next?.type === 'MemberExpression' && next.object === parent && propertyName(next) === 'get'
  );
}

function wrappedResult(node) {
  let current = node;
  while (
    current.parent?.type === 'CallExpression' &&
    current.parent.arguments.includes(current) &&
    current.parent.callee.type === 'Identifier' &&
    !current.parent.callee.name.startsWith('use')
  ) {
    current = current.parent;
  }
  return current;
}

function onlyByIdPattern(pattern) {
  return (
    pattern.type === 'ObjectPattern' &&
    pattern.properties.length > 0 &&
    pattern.properties.every(
      (property) =>
        property.type === 'Property' &&
        !property.computed &&
        property.key.type === 'Identifier' &&
        property.key.name === 'byId',
    )
  );
}

function onlyLookups(variable) {
  const reads = variable.references.filter((reference) => !reference.init);
  if (reads.length === 0) return false;
  const home = variable.scope.variableScope;
  return reads.every(
    (reference) => reference.from.variableScope !== home || isLookupMember(reference.identifier),
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'useRows on a hot table, useDevices and useAutomations return a new value whenever any of their rows changes, so a component that derives names, one row or a boolean from them re-renders on every unrelated update. Select the value with a store selector instead.',
    },
    schema: [],
    messages: {
      hot: "useRows('{{table}}') subscribes to every row of a hot table, so this component re-renders on each unrelated {{table}} update. Use a selector from store/selectors (useDeviceNames, useDeviceIds, useFirstDevice, useHasDevice, useMatchingDevices, useAutomationNames) or useStoreSelector with an equality check.",
      lookup:
        '{{hook}}() subscribes to the whole list but this code only looks up one row, a name, a count or reads it inside a handler, so the component re-renders on every unrelated update. Use useDevice, useRow, useFirstDevice, useHasDevice, useAutomationRow or useAutomationName, or read the store inside the handler.',
    },
  },
  create(context) {
    const report = (node, hook) => {
      context.report({ node, messageId: 'lookup', data: { hook } });
    };
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return;
        const { name } = node.callee;
        if (name === 'useRows') {
          const table = tableOf(node);
          if (table === null || !HOT_TABLES.has(table)) return;
          context.report({ node, messageId: 'hot', data: { table } });
          return;
        }
        if (!WHOLE_LISTS.has(name)) return;
        const result = wrappedResult(node);
        if (isLookupMember(result)) {
          report(node, name);
          return;
        }
        const { parent } = result;
        if (parent?.type !== 'VariableDeclarator' || parent.init !== result) return;
        if (onlyByIdPattern(parent.id)) {
          report(node, name);
          return;
        }
        if (parent.id.type !== 'Identifier') return;
        const [variable] = context.sourceCode.getDeclaredVariables(parent);
        if (variable !== undefined && onlyLookups(variable)) report(node, name);
      },
    };
  },
};
