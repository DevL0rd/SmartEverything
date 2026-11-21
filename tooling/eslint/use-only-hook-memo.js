const HOOK = /^use[A-Z0-9]/;
const FUNCTION = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
const FRESH = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'ObjectExpression',
  'ArrayExpression',
  'CallExpression',
]);

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  )
    return callee.property.name;
  return null;
}

function nameOf(node) {
  if (node.type === 'FunctionDeclaration') return node.id?.name ?? null;
  const parent = node.parent;
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
    return parent.id.name;
  }
  return null;
}

function hasMemoDirective(node) {
  if (node.body.type !== 'BlockStatement') return false;
  return node.body.body.some(
    (statement) => statement.type === 'ExpressionStatement' && statement.directive === 'use memo',
  );
}

function scan(root) {
  const found = { use: false, otherHook: false, returns: [] };
  if (root.body.type !== 'BlockStatement') found.returns.push(root.body);
  const stack = [root.body];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    if (typeof node.type !== 'string') continue;
    if (node !== root.body && FUNCTION.has(node.type)) continue;
    if (node.type === 'CallExpression') {
      const name = calleeName(node.callee);
      if (name === 'use') found.use = true;
      else if (name !== null && HOOK.test(name)) found.otherHook = true;
    }
    if (node.type === 'ReturnStatement' && node.argument !== null) {
      found.returns.push(node.argument);
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (child !== null && typeof child === 'object') stack.push(child);
    }
  }
  return found;
}

function freshValue(node) {
  const value =
    node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression'
      ? node.expression
      : node;
  if (value.type === 'ConditionalExpression') {
    return freshValue(value.consequent) || freshValue(value.alternate);
  }
  if (value.type === 'LogicalExpression') return freshValue(value.left) || freshValue(value.right);
  if (!FRESH.has(value.type)) return false;
  return !(value.type === 'CallExpression' && calleeName(value.callee) === 'use');
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'In infer mode React Compiler compiles a use-prefixed function only when it calls a recognised hook, and use() is not one. A hook whose only hook is use() is skipped, so the closure, object, array or call result it returns is new on every render and every memo downstream misses.',
    },
    schema: [],
    messages: {
      skipped:
        "{{name}} calls only use(), so React Compiler skips it and its returned value is new on every render. Read the context with useContext(...) or add the 'use memo' directive.",
    },
  },
  create(context) {
    function check(node) {
      const name = nameOf(node);
      if (name === null || !HOOK.test(name) || hasMemoDirective(node)) return;
      const found = scan(node);
      if (!found.use || found.otherHook) return;
      if (!found.returns.some(freshValue)) return;
      context.report({ node, messageId: 'skipped', data: { name } });
    }
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};
