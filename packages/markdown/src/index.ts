/**
 * Strata Safe Markdown AST Parser
 *
 * Designed to strictly produce an Abstract Syntax Tree (AST), never raw HTML.
 * Completely immune to Cross-Site Scripting (XSS).
 */

export type ASTNodeType =
  | 'text'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'spoiler'
  | 'inline_code'
  | 'code_block'
  | 'blockquote'
  | 'heading'
  | 'link'
  | 'mention'
  | 'emoji'
  | 'timestamp';

export interface ASTNode {
  type: ASTNodeType;
  text?: string;
  lang?: string;
  url?: string;
  level?: number;
  mentionType?: 'user' | 'channel' | 'role' | 'everyone';
  id?: string;
  timestamp?: number;
  format?: string;
  children?: ASTNode[];
}

const MAX_PARSE_DEPTH = 8;

export function parseMarkdown(input: string, depth: number = 0): ASTNode[] {
  if (!input || depth > MAX_PARSE_DEPTH) return [];

  const nodes: ASTNode[] = [];
  let cursor = 0;
  const len = input.length;

  while (cursor < len) {
    // 1. Multi-line Code Block: ```lang\ncode```
    if (input.startsWith('```', cursor)) {
      const endIdx = input.indexOf('```', cursor + 3);
      if (endIdx !== -1) {
        const rawContent = input.slice(cursor + 3, endIdx);
        const firstLineEnd = rawContent.indexOf('\n');
        let lang = '';
        let code = rawContent;
        if (firstLineEnd !== -1) {
          lang = rawContent.slice(0, firstLineEnd).trim();
          code = rawContent.slice(firstLineEnd + 1);
        }
        nodes.push({ type: 'code_block', lang: lang || undefined, text: code });
        cursor = endIdx + 3;
        continue;
      }
    }

    // 2. Inline Code: `code`
    if (input[cursor] === '`') {
      const endIdx = input.indexOf('`', cursor + 1);
      if (endIdx !== -1) {
        const code = input.slice(cursor + 1, endIdx);
        nodes.push({ type: 'inline_code', text: code });
        cursor = endIdx + 1;
        continue;
      }
    }

    // 3. Spoiler: ||spoiler||
    if (input.startsWith('||', cursor)) {
      const endIdx = input.indexOf('||', cursor + 2);
      if (endIdx !== -1) {
        const inner = input.slice(cursor + 2, endIdx);
        nodes.push({ type: 'spoiler', children: parseMarkdown(inner, depth + 1) });
        cursor = endIdx + 2;
        continue;
      }
    }

    // 4. Bold: **text**
    if (input.startsWith('**', cursor)) {
      const endIdx = input.indexOf('**', cursor + 2);
      if (endIdx !== -1) {
        const inner = input.slice(cursor + 2, endIdx);
        nodes.push({ type: 'bold', children: parseMarkdown(inner, depth + 1) });
        cursor = endIdx + 2;
        continue;
      }
    }

    // 5. Underline: __text__
    if (input.startsWith('__', cursor)) {
      const endIdx = input.indexOf('__', cursor + 2);
      if (endIdx !== -1) {
        const inner = input.slice(cursor + 2, endIdx);
        nodes.push({ type: 'underline', children: parseMarkdown(inner, depth + 1) });
        cursor = endIdx + 2;
        continue;
      }
    }

    // 6. Strikethrough: ~~text~~
    if (input.startsWith('~~', cursor)) {
      const endIdx = input.indexOf('~~', cursor + 2);
      if (endIdx !== -1) {
        const inner = input.slice(cursor + 2, endIdx);
        nodes.push({ type: 'strikethrough', children: parseMarkdown(inner, depth + 1) });
        cursor = endIdx + 2;
        continue;
      }
    }

    // 7. Italic: *text* (single star)
    if (input[cursor] === '*' && input[cursor + 1] !== '*') {
      const endIdx = input.indexOf('*', cursor + 1);
      if (endIdx !== -1 && endIdx > cursor + 1) {
        const inner = input.slice(cursor + 1, endIdx);
        nodes.push({ type: 'italic', children: parseMarkdown(inner, depth + 1) });
        cursor = endIdx + 1;
        continue;
      }
    }

    // 8. Masked Link: [title](url)
    if (input[cursor] === '[') {
      const closeBracket = input.indexOf(']', cursor + 1);
      if (closeBracket !== -1 && input[closeBracket + 1] === '(') {
        const closeParen = input.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const title = input.slice(cursor + 1, closeBracket);
          const rawUrl = input.slice(closeBracket + 2, closeParen).trim();

          // Only allow safe http/https URLs; prevent javascript: or data:
          let safeUrl = '';
          if (/^https?:\/\//i.test(rawUrl)) {
            safeUrl = rawUrl;
          }

          if (safeUrl) {
            nodes.push({ type: 'link', url: safeUrl, text: title });
          } else {
            // Render unsafe as plain text
            nodes.push({ type: 'text', text: `[${title}](${rawUrl})` });
          }
          cursor = closeParen + 1;
          continue;
        }
      }
    }

    // 9. Mentions & Special Tags: <@123>, <#123>, <@&123>, <:name:123>, <t:1700000000:R>
    if (input[cursor] === '<') {
      const closeIdx = input.indexOf('>', cursor + 1);
      if (closeIdx !== -1) {
        const tag = input.slice(cursor + 1, closeIdx);

        // User mention: <@12345> or <@!12345>
        const userMatch = tag.match(/^@!?([0-9]+)$/);
        if (userMatch) {
          nodes.push({ type: 'mention', mentionType: 'user', id: userMatch[1] });
          cursor = closeIdx + 1;
          continue;
        }

        // Channel mention: <#12345>
        const chanMatch = tag.match(/^#([0-9]+)$/);
        if (chanMatch) {
          nodes.push({ type: 'mention', mentionType: 'channel', id: chanMatch[1] });
          cursor = closeIdx + 1;
          continue;
        }

        // Role mention: <@&12345>
        const roleMatch = tag.match(/^@&([0-9]+)$/);
        if (roleMatch) {
          nodes.push({ type: 'mention', mentionType: 'role', id: roleMatch[1] });
          cursor = closeIdx + 1;
          continue;
        }

        // Custom emoji: <:name:12345>
        const emojiMatch = tag.match(/^:([a-zA-Z0-9_]+):([0-9]+)$/);
        if (emojiMatch) {
          nodes.push({ type: 'emoji', text: emojiMatch[1], id: emojiMatch[2] });
          cursor = closeIdx + 1;
          continue;
        }

        // Dynamic timestamp: <t:1700000000:R>
        const timeMatch = tag.match(/^t:([0-9]+)(?::([A-Za-z]))?$/);
        if (timeMatch) {
          nodes.push({
            type: 'timestamp',
            timestamp: parseInt(timeMatch[1]!, 10),
            format: timeMatch[2] || 'f'
          });
          cursor = closeIdx + 1;
          continue;
        }
      }
    }

    // 10. @everyone or @here mention
    if (input.startsWith('@everyone', cursor)) {
      nodes.push({ type: 'mention', mentionType: 'everyone', text: '@everyone' });
      cursor += 9;
      continue;
    }

    // Plain text character
    const char = input[cursor] ?? '';
    const lastNode = nodes[nodes.length - 1];
    if (lastNode && lastNode.type === 'text') {
      lastNode.text = (lastNode.text ?? '') + char;
    } else {
      nodes.push({ type: 'text', text: char });
    }
    cursor++;
  }

  return nodes;
}
