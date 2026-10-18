const LOG_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'exception', 'failed']);
const LOGGER_NAME = /^(log|logger|[a-z]*Log|[a-z]*Logger|operation|op)$/;
const REPORTER_NAME = /^(log|report|fail)[A-Z]|^(reportFailure|handleFailure)$/;
const NOOP_NAME = /^(noop|ignore|ignored|swallow|nothing)$/i;
const FUNCTION = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

function lastName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return '';
}

function isLoggerCall(node) {
  const { callee } = node;
  if (callee.type === 'Identifier') return REPORTER_NAME.test(callee.name);
  if (callee.type !== 'MemberExpression' || callee.computed) return false;
  const method = lastName(callee);
  if (REPORTER_NAME.test(method)) return true;
  return LOG_METHODS.has(method) && LOGGER_NAME.test(lastName(callee.object));
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((child) => walk(child, visit));
  if (typeof node.type !== 'string') return false;
  if (visit(node)) return true;
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    if (walk(node[key], visit)) return true;
  }
  return false;
}

function handles(body, param) {
  const name = param?.type === 'Identifier' ? param.name : null;
  return walk(body, (node) => {
    if (node.type === 'ThrowStatement') return true;
    if (node.type === 'CallExpression' && isLoggerCall(node)) return true;
    return name !== null && node.type === 'Identifier' && node.name === name;
  });
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Every caught error must be logged through the Logger, rethrown or handed onward. Silent catches, empty .catch handlers and noop rejection handlers hide failures.',
    },
    schema: [],
    messages: {
      catchSwallowed:
        'This catch neither logs through the Logger, rethrows nor uses the error. Log it once here with the cause (log.warn("noun.verb", { ... }) or log.error("noun.verb", error, { ... })) or rethrow.',
      handlerSwallowed:
        'This .catch handler drops the rejection. Bind the error and log it through the Logger or rethrow.',
      noopHandler:
        '.catch with a no-op handler hides the rejection. Pass a handler that logs it through the Logger.',
    },
  },
  create(context) {
    return {
      CatchClause(node) {
        if (!handles(node.body, node.param)) {
          context.report({ node, messageId: 'catchSwallowed' });
        }
      },
      CallExpression(node) {
        if (lastName(node.callee) !== 'catch' || node.callee.type !== 'MemberExpression') return;
        const [handler] = node.arguments;
        if (handler === undefined) return;
        if (handler.type === 'Identifier') {
          if (NOOP_NAME.test(handler.name)) context.report({ node, messageId: 'noopHandler' });
          return;
        }
        if (!FUNCTION.has(handler.type)) return;
        const [param] = handler.params;
        if (!handles(handler.body, param)) {
          context.report({ node, messageId: 'handlerSwallowed' });
        }
      },
    };
  },
};
