const QUIET_LEVELS = new Set(['debug', 'trace']);

const CHEAP_CALLS = new Set(['String', 'Number', 'Boolean']);

const CHEAP_MATH = new Set(['round', 'floor', 'ceil', 'min', 'max', 'abs', 'trunc']);

function isCheapCallee(callee) {
  if (callee.type === 'Identifier') return CHEAP_CALLS.has(callee.name);
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Math' &&
    callee.property.type === 'Identifier' &&
    CHEAP_MATH.has(callee.property.name)
  );
}

function eagerIn(node) {
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
    case 'ThisExpression':
      return null;
    case 'TemplateLiteral':
      return node.expressions.length === 0 ? null : node;
    case 'MemberExpression':
      return eagerIn(node.object) ?? (node.computed ? eagerIn(node.property) : null);
    case 'ChainExpression':
    case 'TSAsExpression':
    case 'TSNonNullExpression':
      return eagerIn(node.expression);
    case 'UnaryExpression':
      return eagerIn(node.argument);
    case 'BinaryExpression':
    case 'LogicalExpression':
      return eagerIn(node.left) ?? eagerIn(node.right);
    case 'ConditionalExpression':
      return eagerIn(node.test) ?? eagerIn(node.consequent) ?? eagerIn(node.alternate);
    case 'ObjectExpression':
      return eagerInObject(node);
    case 'CallExpression':
      return isCheapCallee(node.callee) ? firstEager(node.arguments) : node;
    default:
      return node;
  }
}

function firstEager(nodes) {
  for (const one of nodes) {
    const found = eagerIn(one);
    if (found !== null) return found;
  }
  return null;
}

function eagerInObject(node) {
  for (const property of node.properties) {
    if (property.type === 'SpreadElement') return property;
    const found = (property.computed ? eagerIn(property.key) : null) ?? eagerIn(property.value);
    if (found !== null) return found;
  }
  return null;
}

function isLazy(node) {
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function deferred(fixer, sourceCode, payload) {
  const text = sourceCode.getText(payload);
  if (/\b(await|yield)\b/.test(text)) return null;
  const body = payload.type === 'ObjectExpression' ? `(${text})` : text;
  return fixer.replaceText(payload, `() => ${body}`);
}

function quietLevelOf(callee) {
  if (callee.type !== 'MemberExpression' || callee.computed) return null;
  const { property } = callee;
  return property.type === 'Identifier' && QUIET_LEVELS.has(property.name) ? property.name : null;
}

export default {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'A debug or trace line is dropped in release, so its arguments must cost nothing to build: plain values only, or a function payload the logger calls when the level is on.',
    },
    schema: [],
    messages: {
      eager:
        '{{level}} arguments are built even when the level is off. Pass the payload as a function, log.{{level}}("noun.verb", () => ({ ... })), or log only plain values.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const level = quietLevelOf(node.callee);
        if (level === null || node.arguments.length === 0) return;
        const [event, payload] = node.arguments;
        if (event.type !== 'Literal' && event.type !== 'TemplateLiteral') return;
        if (payload === undefined || isLazy(payload)) return;
        const found = eagerIn(payload);
        if (found === null) return;
        context.report({
          node: found,
          messageId: 'eager',
          data: { level },
          fix: (fixer) => deferred(fixer, context.sourceCode, payload),
        });
      },
    };
  },
};
