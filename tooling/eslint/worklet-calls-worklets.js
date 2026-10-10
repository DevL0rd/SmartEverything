const WORKLET_HOOKS = new Set([
  'useAnimatedStyle',
  'useAnimatedProps',
  'useDerivedValue',
  'useAnimatedReaction',
  'useFrameCallback',
  'useAnimatedScrollHandler',
  'runOnUI',
  'scheduleOnUI',
]);

const GESTURE_EVENTS = new Set([
  'onBegin',
  'onStart',
  'onUpdate',
  'onChange',
  'onEnd',
  'onFinalize',
  'onTouchesDown',
  'onTouchesMove',
  'onTouchesUp',
  'onTouchesCancelled',
]);

const SHARED_VALUE_METHODS = new Set(['get', 'set', 'modify']);

const WORKLET_MODULES = /^react-native-(reanimated|worklets)$/;

const ALIAS = 2097152;

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);

function hasWorkletDirective(fn) {
  const body = fn.body;
  if (!body || body.type !== 'BlockStatement') return false;
  return body.statements?.[0]?.directive === 'worklet' || body.body?.[0]?.directive === 'worklet';
}

function isFunction(node) {
  return node !== null && node !== undefined && FUNCTIONS.has(node.type);
}

function within(node, outer) {
  return node.range[0] >= outer.range[0] && node.range[1] <= outer.range[1];
}

function variableOf(sourceCode, identifier) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const found = scope.set.get(identifier.name);
    if (found) return found;
    scope = scope.upper;
  }
  return null;
}

function functionOfDefinition(definition) {
  if (definition.type === 'FunctionName') return definition.node;
  if (definition.type === 'Variable' && isFunction(definition.node.init))
    return definition.node.init;
  return null;
}

function tsFunctionOf(declaration) {
  if (declaration === undefined) return null;
  if (declaration.body !== undefined) return declaration;
  const init = declaration.initializer;
  return init !== undefined && init.body !== undefined ? init : null;
}

function tsHasWorkletDirective(fn) {
  const first = fn.body.statements?.[0];
  return first?.expression?.text === 'worklet';
}

function importedIsWorklet(services, identifier) {
  if (!services?.program) return true;
  const checker = services.program.getTypeChecker();
  const node = services.esTreeNodeToTSNodeMap.get(identifier);
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol === undefined) return true;
  if ((symbol.flags & ALIAS) !== 0) symbol = checker.getAliasedSymbol(symbol);
  const fn = tsFunctionOf(symbol.valueDeclaration);
  return fn === null ? true : tsHasWorkletDirective(fn);
}

function isWorkletBinding(variable, services, identifier) {
  return variable.defs.some((definition) => {
    if (definition.type === 'ImportBinding') {
      return (
        WORKLET_MODULES.test(definition.parent.source.value) ||
        importedIsWorklet(services, identifier)
      );
    }
    if (definition.type === 'Parameter') return true;
    const fn = functionOfDefinition(definition);
    return fn !== null && hasWorkletDirective(fn);
  });
}

function isOutside(variable, worklet) {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((definition) => !within(definition.node, worklet))
  );
}

function chainRunsOnJs(call) {
  let top = call;
  while (
    top.parent?.type === 'MemberExpression' &&
    top.parent.object === top &&
    top.parent.parent?.type === 'CallExpression' &&
    top.parent.parent.callee === top.parent
  ) {
    top = top.parent.parent;
  }
  let cursor = top;
  while (cursor?.type === 'CallExpression' && cursor.callee.type === 'MemberExpression') {
    const { property } = cursor.callee;
    const [first] = cursor.arguments;
    if (property.name === 'runOnJS' && first?.value === true) return true;
    cursor = cursor.callee.object;
  }
  return false;
}

function gestureRoot(call) {
  let cursor = call.callee.object;
  while (cursor) {
    if (cursor.type === 'CallExpression') cursor = cursor.callee;
    else if (cursor.type === 'MemberExpression') cursor = cursor.object;
    else break;
  }
  return cursor?.type === 'Identifier' && cursor.name === 'Gesture';
}

function rootIdentifier(callee) {
  let cursor = callee;
  while (cursor?.type === 'MemberExpression') cursor = cursor.object;
  return cursor?.type === 'Identifier' ? cursor : null;
}

function create(context) {
  const { sourceCode } = context;
  const services = sourceCode.parserServices;
  const checked = new Set();

  function offence(node, worklet) {
    const callee = node.callee;
    if (callee.type === 'Identifier') {
      const variable = variableOf(sourceCode, callee);
      if (
        variable === null ||
        !isOutside(variable, worklet) ||
        isWorkletBinding(variable, services, callee)
      ) {
        return null;
      }
      return callee.name;
    }
    if (callee.type !== 'MemberExpression') return null;
    if (!callee.computed && SHARED_VALUE_METHODS.has(callee.property.name)) return null;
    const root = rootIdentifier(callee);
    if (root === null) return null;
    const variable = variableOf(sourceCode, root);
    if (
      variable === null ||
      !isOutside(variable, worklet) ||
      isWorkletBinding(variable, services, root)
    ) {
      return null;
    }
    const imported = variable.defs.some((definition) => definition.type === 'ImportBinding');
    const declared = variable.defs.some((definition) => functionOfDefinition(definition) !== null);
    return imported || declared ? sourceCode.getText(callee) : null;
  }

  function inspect(worklet) {
    if (checked.has(worklet)) return;
    checked.add(worklet);
    const visit = (node) => {
      if (node.type === 'CallExpression') {
        const name = offence(node, worklet);
        if (name !== null) context.report({ node, messageId: 'call', data: { name } });
      }
      for (const key of sourceCode.visitorKeys[node.type] ?? []) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach((item) => item && visit(item));
        else if (child) visit(child);
      }
    };
    visit(worklet.body);
  }

  function inspectCallback(argument) {
    if (isFunction(argument)) {
      inspect(argument);
      return;
    }
    if (argument.type === 'ObjectExpression') {
      argument.properties.forEach((property) => {
        const value = property.type === 'Property' ? property.value : null;
        if (isFunction(value)) inspect(value);
      });
    }
  }

  function inspectGestureReference(argument) {
    if (argument.type !== 'Identifier') return;
    const variable = variableOf(sourceCode, argument);
    if (variable !== null && !isWorkletBinding(variable, services, argument)) {
      context.report({ node: argument, messageId: 'callback', data: { name: argument.name } });
    }
  }

  return {
    CallExpression(node) {
      const { callee } = node;
      if (
        callee.type === 'Identifier' &&
        (WORKLET_HOOKS.has(callee.name) || /^with[A-Z]/.test(callee.name))
      ) {
        node.arguments.forEach(inspectCallback);
        return;
      }
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        GESTURE_EVENTS.has(callee.property.name) &&
        gestureRoot(node) &&
        !chainRunsOnJs(node)
      ) {
        node.arguments.forEach((argument) => {
          inspectCallback(argument);
          inspectGestureReference(argument);
        });
      }
    },
    'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node) {
      if (hasWorkletDirective(node)) inspect(node);
    },
  };
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A worklet runs on the UI thread, where a plain JavaScript function cannot be called. Mark the callee with the worklet directive or hand it over with scheduleOnRN.',
    },
    schema: [],
    messages: {
      call: 'The worklet calls {{name}}, which is not a worklet. On the UI thread this throws "Tried to synchronously call a Remote Function". Add the "worklet" directive to it, compute the value before the worklet, or call it through scheduleOnRN.',
      callback:
        'The gesture callback {{name}} is not a worklet. Add the "worklet" directive to it or end the gesture chain with runOnJS(true).',
    },
  },
  create,
};
