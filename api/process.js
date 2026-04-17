module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-License-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { html, action = 'beautify', indentSize = 2, preserveComments = false } = req.body || {};

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    let result;
    let stats = { originalSize: html.length };

    if (action === 'minify') {
      result = minifyHTML(html, { preserveComments });
      stats.minifiedSize = result.length;
      stats.savingsPercent = Math.round((1 - result.length / html.length) * 100);
    } else if (action === 'beautify') {
      result = beautifyHTML(html, { indentSize, preserveComments });
      stats.beautifiedSize = result.length;
    } else if (action === 'validate') {
      const validation = validateHTML(html);
      return res.status(200).json({ valid: validation.valid, errors: validation.errors });
    } else {
      return res.status(400).json({ error: 'Invalid action. Use: beautify, minify, validate' });
    }

    return res.status(200).json({
      result,
      action,
      stats
    });
  } catch (err) {
    return res.status(500).json({ error: 'Processing failed', message: err.message });
  }
};

function minifyHTML(html, options = {}) {
  let result = html;

  // Preserve comments option
  if (!options.preserveComments) {
    result = result.replace(/<!--[\s\S]*?-->/g, '');
  }

  // Remove whitespace between tags
  result = result.replace(/>\s+</g, '><');

  // Remove leading/trailing whitespace
  result = result.trim();

  // Collapse multiple spaces
  result = result.replace(/\s+/g, ' ');

  // Remove spaces before/after = in attributes (carefully)
  result = result.replace(/\s*=\s*/g, '=');

  return result;
}

function beautifyHTML(html, options = {}) {
  const indentSize = options.indentSize || 2;
  const indent = ' '.repeat(indentSize);

  let result = html;

  // Normalize newlines
  result = result.replace(/\r\n/g, '\n');

  // Protect comments temporarily
  const comments = [];
  result = result.replace(/<!--([\s\S]*?)-->/g, (match, content) => {
    const id = comments.length;
    comments.push(content);
    return `__COMMENT_${id}__`;
  });

  // Split by tags
  const tokens = result.split(/(<[^>]+>)/g).filter(Boolean);

  let formatted = '';
  let depth = 0;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim();
    if (!token) continue;

    if (token.startsWith('</')) {
      // Closing tag
      depth = Math.max(0, depth - 1);
      formatted += indent.repeat(depth) + token + '\n';
    } else if (token.startsWith('<')) {
      // Opening or self-closing tag
      const tagName = token.match(/<([a-zA-Z][a-zA-Z0-9]*)/)?.[1]?.toLowerCase();
      const isSelfClosing = token.endsWith('/>') || (tagName && voidTags.has(tagName));

      formatted += indent.repeat(depth) + token + '\n';

      if (!isSelfClosing && !token.endsWith('/>')) {
        depth++;
      }
    } else {
      // Text content
      const trimmed = token.trim();
      if (trimmed) {
        formatted += indent.repeat(depth) + trimmed + '\n';
      }
    }
  }

  // Restore comments
  comments.forEach((content, id) => {
    formatted = formatted.replace(`__COMMENT_${id}__`, `<!--${content}-->`);
  });

  return formatted.trim();
}

function validateHTML(html) {
  const errors = [];
  const stack = [];

  // Remove comments and DOCTYPE
  const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');

  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)[^>]*>|<\/([a-zA-Z][a-zA-Z0-9]*)>/g;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  let match;
  while ((match = tagRegex.exec(cleanHtml)) !== null) {
    const openTag = match[1];
    const closeTag = match[2];

    if (openTag) {
      if (!voidTags.has(openTag.toLowerCase())) {
        stack.push(openTag);
      }
    } else if (closeTag) {
      const lastTag = stack.pop();
      if (lastTag && lastTag.toLowerCase() !== closeTag.toLowerCase()) {
        errors.push(`Mismatched tags: <${lastTag}> and </${closeTag}>`);
      }
    }
  }

  if (stack.length > 0) {
    stack.forEach(tag => errors.push(`Unclosed tag: <${tag}>`));
  }

  return { valid: errors.length === 0, errors };
}
