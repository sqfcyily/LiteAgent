import type { ToolSchema } from '../utils/types.js';
import { ReadFileTool, WriteFileTool, EditFileTool, RenameFileTool, DeleteFileTool } from './system/fsTools.js';
import { BashTool } from './system/bashTool.js';
import { BaseTool } from './base.js';

// Central Registry of all system tools
const registry: BaseTool[] = [
  new ReadFileTool(),
  new WriteFileTool(),
  new EditFileTool(),
  new RenameFileTool(),
  new DeleteFileTool(),
  new BashTool(),
  // Keep the echo tool as a simple test fallback if desired
  {
    name: 'echo',
    description: 'Echoes back the input',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    },
    async call(input: { message: string }) {
      return `Echoed: ${input.message}`;
    },
    toSchema() {
      return {
        type: 'function',
        function: { name: this.name, description: this.description, parameters: this.inputSchema }
      } as ToolSchema;
    }
  } as BaseTool
];

export function getSystemTools(): ToolSchema[] {
  return registry.map(tool => tool.toSchema());
}

export async function runTool(name: string, args: any): Promise<string> {
  const tool = registry.find(t => t.name === name);
  if (tool) {
    return await tool.call(args);
  }
  throw new Error(`Tool ${name} not found or not implemented.`);
}
