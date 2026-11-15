const DAY_GRANULAR = new Set([
  'chatListTime',
  'localDayKey',
  'dayKeyOf',
  'weekdayShort',
  'shortDate',
  'sectionsOf',
  'dayLabel',
]);

function calleeName(call) {
  const { callee } = call;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return null;
}

function formatterCallOf(node) {
  let current = node;
  let parent = current.parent;
  if (parent.type === 'Property' && parent.value === current && !parent.computed) {
    const object = parent.parent;
    if (object.type !== 'ObjectExpression') return null;
    current = object;
    parent = object.parent;
  }
  if (parent.type !== 'CallExpression' || !parent.arguments.includes(current)) return null;
  return calleeName(parent);
}

const DEPENDENCY_HOOKS = new Set(['useMemo', 'useCallback', 'useEffect', 'useLayoutEffect']);

function isDependency(node) {
  const list = node.parent;
  if (list.type !== 'ArrayExpression') return false;
  const call = list.parent;
  return (
    call.type === 'CallExpression' &&
    call.arguments[1] === list &&
    DEPENDENCY_HOOKS.has(calleeName(call) ?? '')
  );
}

function isMinuteCall(node) {
  return (
    node !== null &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'useMinute' &&
    node.arguments.length === 0
  );
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'useMinute() re-renders on every minute tick. A value that only feeds day-granular formatters must select it with useMinuteOf or useDayNow so the component re-renders only when the result changes.',
    },
    schema: [],
    messages: {
      preferSelector:
        '{{name}} only feeds day-granular formatters ({{formatters}}), yet useMinute() re-renders this component every minute. Select the result with useMinuteOf((now) => ...), or use useDayNow(timeZone) or useDayKey().',
    },
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !isMinuteCall(node.init)) return;
        const [variable] = context.sourceCode.getDeclaredVariables(node);
        if (variable === undefined) return;
        const reads = variable.references.filter((reference) => reference.isRead());
        const formatters = new Set();
        for (const reference of reads) {
          if (isDependency(reference.identifier)) continue;
          const name = formatterCallOf(reference.identifier);
          if (name === null || !DAY_GRANULAR.has(name)) return;
          formatters.add(name);
        }
        if (formatters.size === 0) return;
        context.report({
          node,
          messageId: 'preferSelector',
          data: { name: node.id.name, formatters: [...formatters].join(', ') },
        });
      },
    };
  },
};
