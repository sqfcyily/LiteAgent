import React from 'react';
import { Text, Box } from 'ink';
import type { ToolSchema } from '../utils/types.js';

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: Record<string, any>;
  
  // Whether the tool can be safely executed concurrently with other safe tools
  isConcurrencySafe: boolean = false;

  abstract call(input: any, context?: any): Promise<string>;

  // Optional UI Rendering Methods (matching Claude Code architecture)
  renderToolUseMessage(args: any): React.ReactNode {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'row' },
      React.createElement(Text, { color: 'yellow' }, '⚙️  Calling Tool: '),
      React.createElement(Text, { color: 'yellow', bold: true }, this.name)
    );
  }

  renderToolUseProgressMessage?(args: any, progress: any): React.ReactNode;

  renderToolResultMessage(args: any, result: string): React.ReactNode {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'column' },
      React.createElement(
        Box,
        { flexDirection: 'row' },
        React.createElement(Text, { color: 'green' }, '✓  Tool Completed: '),
        React.createElement(Text, { color: 'green', bold: true }, this.name)
      ),
      React.createElement(
        Box,
        { paddingLeft: 2 },
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          result.length > 200 ? result.substring(0, 200) + '...' : result
        )
      )
    );
  }

  renderToolUseRejectedMessage?(args: any, error: string): React.ReactNode {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'row' },
      React.createElement(Text, { color: 'red' }, '⛔  Tool Rejected: '),
      React.createElement(Text, { color: 'red', bold: true }, this.name),
      React.createElement(Text, { color: 'red' }, ` - ${error}`)
    );
  }

  renderToolUseErrorMessage(args: any, error: string): React.ReactNode {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'row' },
      React.createElement(Text, { color: 'red' }, '✖  Tool Error: '),
      React.createElement(Text, { color: 'red', bold: true }, this.name),
      React.createElement(Text, { color: 'red' }, ` - ${error}`)
    );
  }

  toSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.inputSchema
      }
    };
  }
}
