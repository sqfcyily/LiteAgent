import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from '../base.js';

const execAsync = promisify(exec);

export class BashTool extends BaseTool {
  readonly name = 'bash_command';
  readonly description = 'Executes a shell command in the current working directory. Useful for running scripts, git commands, listing files, or exploring the file system.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to execute' }
    },
    required: ['command']
  };

  async call(input: { command: string }): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(input.command, { cwd: process.cwd() });
      let result = '';
      if (stdout) result += `STDOUT:\n${stdout}\n`;
      if (stderr) result += `STDERR:\n${stderr}\n`;
      return result.trim() || 'Command executed successfully with no output.';
    } catch (err: any) {
      let errorMsg = `Command failed with exit code ${err.code}.\n`;
      if (err.stdout) errorMsg += `STDOUT:\n${err.stdout}\n`;
      if (err.stderr) errorMsg += `STDERR:\n${err.stderr}\n`;
      return errorMsg.trim();
    }
  }
}
