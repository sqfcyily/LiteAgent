import React from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';

interface MarkdownProps {
  children: string;
}

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
          <Box key={index} marginBottom={1} marginTop={1}>
            <Text bold color="cyan">
              {`${'#'.repeat(token.depth)} ${token.text}`}
            </Text>
          </Box>
        );
      case 'paragraph':
        return (
          <Box key={index} marginBottom={1}>
            <Text>{token.text}</Text>
          </Box>
        );
      case 'list':
        return (
          <Box key={index} flexDirection="column" marginBottom={1} paddingLeft={2}>
            {token.items.map((item: any, i: number) => (
              <Box key={i}>
                <Text color="yellow"> • </Text>
                <Text>{item.text}</Text>
              </Box>
            ))}
          </Box>
        );
      case 'code':
        return (
          <Box key={index} borderStyle="round" borderColor="gray" paddingX={1} marginY={1}>
            <Text color="green">{token.text}</Text>
          </Box>
        );
      case 'space':
        return null;
      default:
        // Fallback for unsupported markdown types (tables, blockquotes, etc.)
        // Just render the raw text so we don't lose data.
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
