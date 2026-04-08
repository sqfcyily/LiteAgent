import { BaseTool } from '../base.js';
import { runEngine, EngineConfig } from '../../services/agentEngine.js';
import type { ToolSchema, Message } from '../../utils/types.js';
import type { SkillDefinition } from '../../skills/skillLoader.js';

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

  private skills: SkillDefinition[];

  constructor(skills: SkillDefinition[]) {
    super();
    this.skills = skills;
    
    // Build a detailed description based on YAML metadata
    const skillDescriptions = skills.map(s => {
      let desc = `- ${s.name}`;
      if (s.description) desc += `: ${s.description}`;
      if (s.arguments && s.arguments.length > 0) desc += ` (args: ${s.arguments.join(', ')})`;
      return desc;
    }).join('\n');

    this.description = `Execute a skill. You MUST use this tool to invoke any available skill.\nAvailable skills:\n${skillDescriptions || 'none'}`;
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

    // Apply allowedTools filter if specified in YAML
    let allowedTools = tools;
    if (targetSkill.allowedTools && targetSkill.allowedTools.length > 0) {
      allowedTools = tools.filter(t => targetSkill.allowedTools!.includes(t.function.name));
    }

    // Replace $ARGUMENTS in the markdown prompt if args are provided
    let finalInstructions = targetSkill.instructions;
    if (args) {
      finalInstructions = finalInstructions.replace(/\$ARGUMENTS/g, args);
      // Also support positional like $1, $2 (basic space separation)
      const argParts = args.split(' ');
      argParts.forEach((arg, i) => {
        finalInstructions = finalInstructions.replace(new RegExp(`\\$${i + 1}`, 'g'), arg);
      });
    }

    // Create a sub-agent context
    const subAgentSystemPrompt = `You are a specialized sub-agent executing the skill: ${skill}.
Your instructions are as follows:
---
${finalInstructions}
---
Use the provided tools if necessary to complete your task.`;

    const subMessages: Message[] = [
      { role: 'system', content: subAgentSystemPrompt },
      { role: 'user', content: `Please execute the skill: ${skill}${args ? ` with args: ${args}` : ''}` }
    ];

    let finalResult = '';

    try {
      // Run the sub-agent engine
      // We do not yield its inner progress to the main UI in order to keep it clean,
      // but we await its completion to get the final result.
      const stream = runEngine(subMessages, allowedTools, config);
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
