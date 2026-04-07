import React from 'react';
import { Box, Text } from 'ink';
import { marked, Token } from 'marked';

interface MarkdownProps {
  children: string;
}

// Utility to recursively extract raw text from tokens
const extractText = (tokens: Token[] = []): string => {
  return tokens.reduce((acc, token) => {
    if ('text' in token) return acc + token.text;
    if ('tokens' in token && token.tokens) return acc + extractText(token.tokens);
    return acc + token.raw;
  }, '');
};

/**
 * A lightweight, custom Markdown renderer for Ink.
 * Parses raw markdown text and returns styled Ink <Text> and <Box> components.
 */
export const Markdown: React.FC<MarkdownProps> = ({ children }) => {
  if (!children) return null;

  const tokens = marked.lexer(children);

  const renderToken = (token: any, index: number) => {
    switch (token.type) {
      case 'heading':
          return (
            <Box key={index} marginTop={1} marginBottom={1}>
              <Text bold color="cyan">
                {'#'.repeat(token.depth)} {extractText(token.tokens || [])}
              </Text>
            </Box>
          );
      case 'paragraph':
        return (
          <Box key={index} marginBottom={0}>
            <Text>{extractText(token.tokens || [])}</Text>
          </Box>
        );
      case 'list':
        return (
          <Box key={index} flexDirection="column" paddingLeft={2} marginTop={1} marginBottom={1}>
            {token.items.map((item: any, i: number) => (
              <Box key={i} flexDirection="row">
                <Text color="cyan">• </Text>
                <Text>{extractText(item.tokens || [])}</Text>
              </Box>
            ))}
          </Box>
        );
      case 'code':
        return (
          <Box key={index} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1} marginBottom={1}>
            <Text color="gray">{token.lang || 'text'}</Text>
            <Text>{token.text}</Text>
          </Box>
        );
      case 'space':
        return null;
      default:
        // Fallback for unsupported markdown types (tables, blockquotes, etc.)
        if (token.raw) {
          return (
            <Box key={index}>
              <Text>{token.raw.trim()}</Text>
            </Box>
          );
        }
        return null;
    }
  };

  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => renderToken(token, i))}
    </Box>
  );
};
