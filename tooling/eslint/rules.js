import workletCallsWorklets from './worklet-calls-worklets.js';

const CONTROL = /^\s*(eslint|global|globals|exported|prettier-ignore)\b/;

const noComments = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid code comments. Naming and structure carry meaning; prose belongs in docs/.',
    },
    schema: [],
    messages: {
      comment:
        'Code comments are forbidden. Name it so it explains itself, or put the explanation in docs/. Only eslint and prettier control comments are allowed.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (CONTROL.test(comment.value)) continue;
          context.report({ node: comment, messageId: 'comment' });
        }
      },
    };
  },
};

export default {
  rules: { 'no-comments': noComments, 'worklet-calls-worklets': workletCallsWorklets },
};
