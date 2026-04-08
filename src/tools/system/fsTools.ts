import React from 'react';
import { Text, Box } from 'ink';
import { promises as fs } from 'fs';
import * as path from 'path';
import { BaseTool } from '../base.js';

const resolvePath = (p: string) => path.resolve(process.cwd(), p);

export class ReadFileTool extends BaseTool {
  readonly name = 'read_file';
  isConcurrencySafe = true;
  readonly description = 'Reads the contents of a file from the local file system. Use this to inspect file contents.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'The absolute or relative path to the file to read' }
    },
    required: ['file_path']
  };

  renderToolUseMessage(args: { file_path: string }) {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'row' },
      React.createElement(Text, { color: 'yellow' }, '📖 Reading file: '),
      React.createElement(Text, { color: 'yellow', bold: true }, args.file_path || 'unknown')
    );
  }

  renderToolResultMessage(args: { file_path: string }, result: string) {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'row' },
      React.createElement(Text, { color: 'green' }, '✓ Read file: '),
      React.createElement(Text, { color: 'green', bold: true }, args.file_path || 'unknown')
    );
  }

  async call(input: { file_path: string }): Promise<string> {
    try {
      const targetPath = resolvePath(input.file_path);
      const content = await fs.readFile(targetPath, 'utf-8');
      return content;
    } catch (err: any) {
      return `Failed to read file: ${err.message}`;
    }
  }
}

export class WriteFileTool extends BaseTool {
  readonly name = 'write_file';
  readonly description = 'Creates a new file or overwrites an existing file with the provided content.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'The absolute or relative path where the file will be created/overwritten' },
      content: { type: 'string', description: 'The entire content to write into the file' }
    },
    required: ['file_path', 'content']
  };

  renderToolUseMessage(args: { file_path: string }) {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'row' },
      React.createElement(Text, { color: 'yellow' }, '✏️  Writing to file: '),
      React.createElement(Text, { color: 'yellow', bold: true }, args.file_path || 'unknown')
    );
  }

  renderToolResultMessage(args: { file_path: string }, result: string) {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'row' },
      React.createElement(Text, { color: 'green' }, '✓ Wrote to file: '),
      React.createElement(Text, { color: 'green', bold: true }, args.file_path || 'unknown')
    );
  }

  async call(input: { file_path: string, content: string }): Promise<string> {
    try {
      const targetPath = resolvePath(input.file_path);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, input.content, 'utf-8');
      return `Successfully wrote to file: ${targetPath}`;
    } catch (err: any) {
      return `Failed to write file: ${err.message}`;
    }
  }
}

export class EditFileTool extends BaseTool {
  readonly name = 'edit_file';
  readonly description = 'Modifies an existing file by replacing a specific string with a new string. Ensure the old_string matches the file content exactly.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'The absolute or relative path to the file to edit' },
      old_string: { type: 'string', description: 'The exact string to be replaced' },
      new_string: { type: 'string', description: 'The string to replace the old_string with' }
    },
    required: ['file_path', 'old_string', 'new_string']
  };

  async call(input: { file_path: string, old_string: string, new_string: string }): Promise<string> {
    try {
      const targetPath = resolvePath(input.file_path);
      const content = await fs.readFile(targetPath, 'utf-8');
      if (!content.includes(input.old_string)) {
        return `Error: The string provided in old_string was not found in the file. No changes made.`;
      }
      const newContent = content.replace(input.old_string, input.new_string);
      await fs.writeFile(targetPath, newContent, 'utf-8');
      return `Successfully edited file: ${targetPath}`;
    } catch (err: any) {
      return `Failed to edit file: ${err.message}`;
    }
  }
}

export class RenameFileTool extends BaseTool {
  readonly name = 'rename_file';
  readonly description = 'Renames a file or moves it to a new path.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      old_path: { type: 'string', description: 'The current path of the file' },
      new_path: { type: 'string', description: 'The new path for the file' }
    },
    required: ['old_path', 'new_path']
  };

  async call(input: { old_path: string, new_path: string }): Promise<string> {
    try {
      const oldTargetPath = resolvePath(input.old_path);
      const newTargetPath = resolvePath(input.new_path);
      await fs.mkdir(path.dirname(newTargetPath), { recursive: true });
      await fs.rename(oldTargetPath, newTargetPath);
      return `Successfully renamed ${oldTargetPath} to ${newTargetPath}`;
    } catch (err: any) {
      return `Failed to rename file: ${err.message}`;
    }
  }
}

export class DeleteFileTool extends BaseTool {
  readonly name = 'delete_file';
  readonly description = 'Deletes a file from the file system. Use with caution.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'The absolute or relative path to the file to delete' }
    },
    required: ['file_path']
  };

  async call(input: { file_path: string }): Promise<string> {
    try {
      const targetPath = resolvePath(input.file_path);
      await fs.unlink(targetPath);
      return `Successfully deleted file: ${targetPath}`;
    } catch (err: any) {
      return `Failed to delete file: ${err.message}`;
    }
  }
}
