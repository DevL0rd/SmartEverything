const HOOK = /^use[A-Z0-9]/;
const COMPONENT = /^[A-Z]/;
const FUNCTION = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
const PURE_GLOBALS = new Set([
  'Math',
  'Number',
  'String',
  'Boolean',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
]);
const PRIMITIVE = new Set([
  'BinaryExpression',
  'UnaryExpression',
  'TemplateLiteral',
  'Literal',
  'UpdateExpression',
]);
const BUILDS = new Set([
  'ObjectExpression',
  'ArrayExpression',
  'NewExpression',
  'JSXElement',
  'JSXFragment',
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

function isHookCall(node) {
  if (node.type !== 'CallExpression') return false;
  const name = calleeName(node.callee);
  return name !== null && (name === 'use' || HOOK.test(name));
}

function rootName(node) {
  let current = node;
  while (current.type === 'MemberExpression') current = current.object;
  return current.type === 'Identifier' ? current.name : null;
}

function isPureCall(node) {
  return PURE_GLOBALS.has(rootName(node.callee));
}

function walk(node, visitorKeys, visit, intoHooks = true) {
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object' || typeof current.type !== 'string')
      continue;
    if (current !== node && FUNCTION.has(current.type)) continue;
    visit(current);
    if (!intoHooks && isHookCall(current)) continue;
    for (const key of visitorKeys[current.type] ?? []) {
      const child = current[key];
      if (Array.isArray(child)) stack.push(...child);
      else stack.push(child);
    }
  }
}

function buildsValue(init, visitorKeys) {
  if (FUNCTION.has(init.type) || PRIMITIVE.has(init.type)) return false;
  let builds = false;
  walk(
    init,
    visitorKeys,
    (node) => {
      if (BUILDS.has(node.type)) builds = true;
      else if (node.type === 'CallExpression' && !isHookCall(node) && !isPureCall(node))
        builds = true;
    },
    false,
  );
  return builds;
}

function functionName(fn) {
  if (fn.type === 'FunctionDeclaration') return fn.id?.name ?? null;
  let parent = fn.parent;
  while (parent?.type === 'CallExpression') parent = parent.parent;
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
    return parent.id.name;
  return null;
}

function hooksIn(statement, visitorKeys) {
  const hooks = [];
  walk(statement, visitorKeys, (node) => {
    if (isHookCall(node)) hooks.push(node);
  });
  return hooks;
}

function insideValue(hook, statement) {
  let child = hook;
  let parent = hook.parent;
  while (parent !== undefined && parent !== statement) {
    if (FUNCTION.has(parent.type)) return false;
    if (
      (parent.type === 'CallExpression' || parent.type === 'NewExpression') &&
      parent.arguments.includes(child) &&
      !isHookCall(parent) &&
      !(parent.type === 'CallExpression' && isPureCall(parent))
    )
      return true;
    child = parent;
    parent = parent.parent;
  }
  return false;
}

function insideFunction(identifier, fn) {
  for (let node = identifier.parent; node !== undefined && node !== fn; node = node.parent) {
    if (FUNCTION.has(node.type)) return true;
  }
  return false;
}

function freezes(identifier) {
  const parent = identifier.parent;
  if (parent === undefined) return false;
  if (parent.type === 'CallExpression')
    return isHookCall(parent) && parent.arguments.includes(identifier);
  return parent.type === 'JSXExpressionContainer';
}

function widensValue(identifier) {
  let node = identifier;
  while (node.parent?.type === 'MemberExpression' && node.parent.object === node) {
    const member = node.parent;
    if (member.parent?.type === 'CallExpression' && member.parent.callee === member)
      return !isHookCall(member.parent) && !isPureCall(member.parent);
    node = member;
  }
  const parent = node.parent;
  if (parent === undefined) return false;
  if (parent.type === 'CallExpression' || parent.type === 'NewExpression')
    return (
      parent.arguments.includes(node) &&
      !(parent.type === 'CallExpression' && (isHookCall(parent) || isPureCall(parent)))
    );
  if (parent.type === 'AssignmentExpression') return parent.left === node && node !== identifier;
  if (parent.type === 'UpdateExpression') return node !== identifier;
  return false;
}

function widenedAfter(variable, hook) {
  for (const reference of variable.references) {
    if (freezes(reference.identifier)) return false;
    if (reference.identifier.range[0] > hook.range[1] && widensValue(reference.identifier))
      return true;
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A hook called inside or after a derived value that is still handed to a function later makes the React Compiler drop that value’s memo block, so it is rebuilt on every render.',
    },
    schema: [],
    messages: {
      hookAfterValue:
        '{{hook}} is called after {{value}} is built, and {{value}} is handed to a function after the call. The React Compiler cannot memoise a value across a hook call, so {{value}} is rebuilt on every render. Call every hook first, then derive the values.',
      hookInsideValue:
        '{{hook}} is called while {{value}} is being built, and {{value}} is handed to a function after the call. The React Compiler cannot memoise a value across a hook call, so {{value}} is rebuilt on every render. Call the hook on its own line first.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const { visitorKeys } = sourceCode;
    function declared(statement, fn, index) {
      return statement.declarations.flatMap((declarator) =>
        declarator.init === null || !buildsValue(declarator.init, visitorKeys)
          ? []
          : sourceCode.getDeclaredVariables(declarator).map((variable) => ({
              name: variable.name,
              index,
              references: variable.references
                .filter((reference) => !reference.init && !insideFunction(reference.identifier, fn))
                .sort((left, right) => left.identifier.range[0] - right.identifier.range[0]),
            })),
      );
    }
    function check(fn) {
      const name = functionName(fn);
      if (name === null || !(COMPONENT.test(name) || HOOK.test(name))) return;
      if (fn.body.type !== 'BlockStatement') return;
      const derived = [];
      const locals = fn.body.body.flatMap((statement, index) =>
        statement.type === 'VariableDeclaration'
          ? statement.declarations.flatMap((declarator) =>
              sourceCode.getDeclaredVariables(declarator).map((variable) => ({ variable, index })),
            )
          : [],
      );
      for (const [index, statement] of fn.body.body.entries()) {
        const own = statement.type === 'VariableDeclaration' ? declared(statement, fn, index) : [];
        const needs = Math.max(
          -1,
          ...locals
            .filter(
              (local) =>
                local.index < index &&
                local.variable.references.some(
                  (reference) =>
                    reference.identifier.range[0] >= statement.range[0] &&
                    reference.identifier.range[1] <= statement.range[1],
                ),
            )
            .map((local) => local.index),
        );
        for (const hook of hooksIn(statement, visitorKeys)) {
          const data = { hook: `${calleeName(hook.callee)}()` };
          if (insideValue(hook, statement)) {
            const value = own.find((variable) => widenedAfter(variable, hook));
            if (value !== undefined)
              context.report({
                node: hook,
                messageId: 'hookInsideValue',
                data: { ...data, value: value.name },
              });
            continue;
          }
          const value = derived.find(
            (variable) => variable.index > needs && widenedAfter(variable, hook),
          );
          if (value !== undefined)
            context.report({
              node: hook,
              messageId: 'hookAfterValue',
              data: { ...data, value: value.name },
            });
        }
        derived.push(...own);
      }
    }
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};
