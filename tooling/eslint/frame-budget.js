const HERMES_MISSING = new Set(['toSorted', 'toSpliced', 'toReversed']);
const MIN_INTERVAL_MS = 250;
const CONDITIONAL = new Set(['IfStatement', 'ConditionalExpression', 'LogicalExpression']);
const FUNCTION = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return '';
}

function constantNumber(context, node) {
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value;
  if (node.type !== 'Identifier') return null;
  let scope = context.sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.set.get(node.name);
    const declarator = variable?.defs[0]?.node;
    if (declarator !== undefined) {
      const constant =
        declarator.type === 'VariableDeclarator' && declarator.parent.kind === 'const';
      return constant && declarator.init !== null ? constantNumber(context, declarator.init) : null;
    }
    scope = scope.upper;
  }
  return null;
}

function functionName(fn) {
  if (fn.id?.type === 'Identifier') return fn.id.name;
  const { parent } = fn;
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
    return parent.id.name;
  return null;
}

function unconditionalSelfSchedule(call) {
  const [argument] = call.arguments;
  if (argument?.type !== 'Identifier') return false;
  let node = call.parent;
  while (node !== null && !FUNCTION.has(node.type)) {
    if (CONDITIONAL.has(node.type)) return false;
    node = node.parent;
  }
  return node !== null && functionName(node) === argument.name;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep the JS thread inside its frame budget on Hermes: no ES2023 array copy methods, no intervals faster than 250 ms and no endless requestAnimationFrame loops.',
    },
    schema: [],
    messages: {
      hermes:
        'Hermes does not implement Array.prototype.{{name}}. Copy first ([...items].sort(), .reverse(), .splice()) instead.',
      interval:
        'setInterval every {{delay}} ms wakes the JS thread {{rate}} times a second. Use an event, a Reanimated animation, or an interval of at least 250 ms.',
      frameLoop:
        'This requestAnimationFrame loop reschedules itself every frame for as long as it lives. Drive the value with a Reanimated animation or an event, or stop the loop when it has nothing left to do.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (node.callee.type === 'MemberExpression' && HERMES_MISSING.has(name)) {
          context.report({ node, messageId: 'hermes', data: { name } });
        }
        if (
          node.callee.type === 'MemberExpression' &&
          name === 'with' &&
          node.arguments.length === 2
        ) {
          context.report({ node, messageId: 'hermes', data: { name } });
        }
        if (name === 'setInterval' && node.arguments[1] !== undefined) {
          const delay = constantNumber(context, node.arguments[1]);
          if (delay !== null && delay < MIN_INTERVAL_MS) {
            const rate = String(Math.round(1000 / Math.max(delay, 1)));
            context.report({ node, messageId: 'interval', data: { delay: String(delay), rate } });
          }
        }
        if (name === 'requestAnimationFrame' && unconditionalSelfSchedule(node)) {
          context.report({ node, messageId: 'frameLoop' });
        }
      },
    };
  },
};
