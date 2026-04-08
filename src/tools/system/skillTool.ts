import { BaseTool } from '../base.js';
import { runEngine, EngineConfig } from '../../services/agentEngine.js';
import type { ToolSchema, Message } from '../../utils/types.js';

export class SkillTool extends BaseTool {
  name = 'Skill';
  description = 'Execute a skill. You MUST use this tool to invoke any available skill.';
  inputSchema = {
    type: 'object',
    properties: {
      skill: { type: 'string', description: 'The skill name to execute' },
      args: { type: 'string', description: 'Optional arguments for the skill' }
    },
    required: ['skill']
  };

  private skills: { name: string; instructions: string }[];

  constructor(skills: { name: string; instructions: string }[]) {
    super();
    this.skills = skills;
    this.description = `Execute skill: [skill_name]. You MUST use this tool to invoke any available skill. Available skills: ${skills.map(s => s.name).join(', ') || 'none'}`;
  }

  async call(input: { skill: string; args?: string }, context?: { config: EngineConfig; tools: ToolSchema[] }): Promise<string> {
    const { skill, args } = input;
    const targetSkill = this.skills.find(s => s.name === skill);
    
    if (!targetSkill) {
      return `Error: Skill '${skill}' not found. Available skills: ${this.skills.map(s => s.name).join(', ')}`;
    }

    if (!context || !context.config || !context.tools) {
      return `Error: Missing execution context for SkillTool.`;
    }

    const { config, tools } = context;

    // Create a sub-agent context
    const subAgentSystemPrompt = `You are a specialized sub-agent executing the skill: ${skill}.
Your instructions are as follows:
---
${targetSkill.instructions}
---
Use the provided tools if necessary to complete your task.
${args ? `\nUser provided arguments: ${args}` : ''}`;

    const subMessages: Message[] = [
      { role: 'system', content: subAgentSystemPrompt },
      { role: 'user', content: `Please execute the skill: ${skill}${args ? ` with args: ${args}` : ''}` }
    ];

    let finalResult = '';

    try {
      // Run the sub-agent engine
      // We do not yield its inner progress to the main UI in order to keep it clean,
      // but we await its completion to get the final result.
      const stream = runEngine(subMessages, tools, config);
      for await (const event of stream) {
        if (event.type === 'completed') {
          // Find the last assistant message
          const lastMsg = event.finalMessages[event.finalMessages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            finalResult = lastMsg.content || 'Skill executed successfully with no text output.';
          } else {
            finalResult = 'Skill executed successfully.';
          }
        } else if (event.type === 'error') {
          return `Skill execution failed: ${event.error.message}`;
        }
      }
    } catch (e: any) {
      return `Skill execution failed: ${e.message}`;
    }

    return finalResult || 'Skill executed successfully.';
  }
}
