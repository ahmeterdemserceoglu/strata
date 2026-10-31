import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../src/index.js';

describe('Markdown AST Parser & XSS Immunity Tests', () => {
  it('parses basic formatting: bold, italic, underline, strikethrough, spoiler, code', () => {
    const input = 'Hello **bold** *italic* __under__ ~~strike~~ ||secret|| `let x = 10;`';
    const ast = parseMarkdown(input);

    expect(ast.some((n) => n.type === 'bold')).toBe(true);
    expect(ast.some((n) => n.type === 'italic')).toBe(true);
    expect(ast.some((n) => n.type === 'underline')).toBe(true);
    expect(ast.some((n) => n.type === 'strikethrough')).toBe(true);
    expect(ast.some((n) => n.type === 'spoiler')).toBe(true);
    expect(ast.some((n) => n.type === 'inline_code')).toBe(true);
  });

  it('parses multi-line code block with language', () => {
    const input = '```typescript\nconst greeting: string = "hello";\n```';
    const ast = parseMarkdown(input);

    expect(ast.length).toBe(1);
    expect(ast[0]?.type).toBe('code_block');
    expect(ast[0]?.lang).toBe('typescript');
    expect(ast[0]?.text).toContain('const greeting: string = "hello";');
  });

  it('parses user, channel, role, everyone mentions and custom emojis', () => {
    const input = 'Hey <@123456789> check <#987654321> and <@&11223344> @everyone <:pepe:555666>';
    const ast = parseMarkdown(input);

    const userMention = ast.find((n) => n.type === 'mention' && n.mentionType === 'user');
    expect(userMention?.id).toBe('123456789');

    const chanMention = ast.find((n) => n.type === 'mention' && n.mentionType === 'channel');
    expect(chanMention?.id).toBe('987654321');

    const roleMention = ast.find((n) => n.type === 'mention' && n.mentionType === 'role');
    expect(roleMention?.id).toBe('11223344');

    const everyoneMention = ast.find((n) => n.type === 'mention' && n.mentionType === 'everyone');
    expect(everyoneMention).toBeDefined();

    const emoji = ast.find((n) => n.type === 'emoji');
    expect(emoji?.text).toBe('pepe');
    expect(emoji?.id).toBe('555666');
  });

  it('parses dynamic timestamp <t:1700000000:R>', () => {
    const input = 'Event starts at <t:1700000000:R>';
    const ast = parseMarkdown(input);

    const ts = ast.find((n) => n.type === 'timestamp');
    expect(ts?.timestamp).toBe(1700000000);
    expect(ts?.format).toBe('R');
  });

  it('XSS Immunity: HTML tags remain pure plain text nodes', () => {
    const xssVectors = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(document.cookie)>',
      '<iframe src="https://evil.com"></iframe>',
      '<body onload=alert(1)>'
    ];

    for (const vector of xssVectors) {
      const ast = parseMarkdown(vector);
      // None of these should parse into an unsafe HTML node; only text or unparsed tokens
      const containsDangerousTag = ast.some((n) => (n as any).dangerouslySetInnerHTML);
      expect(containsDangerousTag).toBe(false);

      // The text is safely escaped or kept as literal text
      const fullText = ast.map((n) => n.text || '').join('');
      expect(fullText).toContain(vector);
    }
  });

  it('XSS Immunity: Rejects javascript: URI in links', () => {
    const maliciousLink = '[Click Me](javascript:alert(1))';
    const ast = parseMarkdown(maliciousLink);

    // Must NOT create a link node with javascript: URL
    const linkNode = ast.find((n) => n.type === 'link');
    expect(linkNode).toBeUndefined();

    // Rendered as plain text
    expect(ast[0]?.type).toBe('text');
  });

  it('Allows valid https:// links in markdown', () => {
    const safeLink = '[Strata Website](https://strata.chat)';
    const ast = parseMarkdown(safeLink);

    const linkNode = ast.find((n) => n.type === 'link');
    expect(linkNode).toBeDefined();
    expect(linkNode?.url).toBe('https://strata.chat');
    expect(linkNode?.text).toBe('Strata Website');
  });
});
