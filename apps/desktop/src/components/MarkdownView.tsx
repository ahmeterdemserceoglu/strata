import React from 'react';
import { parseMarkdown, type ASTNode } from '@strata/markdown';

export const MarkdownView: React.FC<{ content: string }> = ({ content }) => {
  const ast = parseMarkdown(content);

  const renderNode = (node: ASTNode, index: number): React.ReactNode => {
    switch (node.type) {
      case 'text':
        return <span key={index}>{node.text}</span>;
      case 'bold':
        return <strong key={index} className="font-bold">{node.children?.map(renderNode)}</strong>;
      case 'italic':
        return <em key={index} className="italic">{node.children?.map(renderNode)}</em>;
      case 'underline':
        return <span key={index} className="underline">{node.children?.map(renderNode)}</span>;
      case 'strikethrough':
        return <span key={index} className="line-through">{node.children?.map(renderNode)}</span>;
      case 'spoiler':
        return (
          <span
            key={index}
            className="cursor-pointer bg-zinc-800 text-transparent hover:text-white rounded px-1 transition-all select-none"
            title="Spoilerı görmek için tıkla"
          >
            {node.children?.map(renderNode)}
          </span>
        );
      case 'inline_code':
        return (
          <code key={index} className="bg-zinc-900 text-indigo-400 px-1.5 py-0.5 rounded text-sm font-mono">
            {node.text}
          </code>
        );
      case 'code_block':
        return (
          <pre key={index} className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg my-1.5 font-mono text-sm overflow-x-auto text-emerald-400">
            {node.lang && <div className="text-xs text-zinc-500 mb-1">{node.lang}</div>}
            <code>{node.text}</code>
          </pre>
        );
      case 'link':
        return (
          <a
            key={index}
            href={node.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-indigo-400 hover:underline"
          >
            {node.text || node.url}
          </a>
        );
      case 'mention':
        return (
          <span key={index} className="bg-indigo-500/20 text-indigo-300 px-1 py-0.5 rounded font-medium text-sm">
            {node.mentionType === 'everyone' ? '@everyone' : `@${node.id}`}
          </span>
        );
      case 'emoji':
        return <span key={index} className="font-semibold text-amber-400">:{node.text}:</span>;
      default:
        return <span key={index}>{node.text}</span>;
    }
  };

  return <div className="text-sm leading-relaxed break-words">{ast.map(renderNode)}</div>;
};
