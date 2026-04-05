import type { ToolSchema, EngineEvent } from '../core/types.js';

export interface Tool {
  schema: ToolSchema;
  execute: (args: Record<string, any>) => Promise<string>;
}

// Global tool registry
const toolRegistry: Record<string, Tool> = {};

export function registerTool(tool: Tool) {
  toolRegistry[tool.schema.function.name] = tool;
}

export async function runTool(name: string, args: Record<string, any>): Promise<string> {
  const tool = toolRegistry[name];
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return await tool.execute(args);
}

// ---------------------------------------------------------
// Built-in System Tools
// ---------------------------------------------------------
registerTool({
  schema: {
    type: 'function',
    function: {
      name: 'echo',
      description: 'Echoes back the input. Use to test basic agent functionality.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message']
      }
    }
  },
  execute: async (args) => {
    return `Echoed: ${args.message}`;
  }
});
