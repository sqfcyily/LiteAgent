import type { ToolSchema } from '../utils/types.js';
import { ReadFileTool, WriteFileTool, EditFileTool, RenameFileTool, DeleteFileTool } from './system/fsTools.js';
import { BashTool } from './system/bashTool.js';
import { SkillTool } from './system/skillTool.js';
import { BaseTool } from './base.js';
import type { SkillDefinition } from '../skills/skillLoader.js';

// Central Registry of all system tools
let registry: BaseTool[] = [];

export function getSystemTools(skills: SkillDefinition[] = []): ToolSchema[] {
  registry = [
    new ReadFileTool(),
    new WriteFileTool(),
    new EditFileTool(),
    new RenameFileTool(),
    new DeleteFileTool(),
    new BashTool(),
    new SkillTool(skills)
  ];
  return registry.map(tool => tool.toSchema());
}

export async function runTool(name: string, args: any, context?: any): Promise<string> {
  const tool = registry.find(t => t.name === name);
  if (tool) {
    // If tool expects context, pass it
    if (tool.name === 'Skill') {
      return await (tool as any).call(args, context);
    }
    return await tool.call(args);
  }
  throw new Error(`Tool ${name} not found or not implemented.`);
}
