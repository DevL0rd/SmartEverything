function isThumbnailCall(node) {
  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'generateThumbnailsAsync'
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'generateThumbnailsAsync without options returns full-resolution video frames, so a small tile or poster decodes and keeps a multi-megapixel bitmap. Pass { maxWidth } sized to the pixels the frame is drawn at.',
    },
    schema: [],
    messages: {
      unsized:
        'generateThumbnailsAsync(...) needs its options argument with maxWidth (for example PixelRatio.getPixelSizeForLayoutSize(width)); without it every frame is decoded at the full video resolution.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isThumbnailCall(node) && node.arguments.length < 2)
          context.report({ node, messageId: 'unsized' });
      },
    };
  },
};
