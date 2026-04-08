import React from 'react';
import { Text, Box } from 'ink';
import { BaseTool } from '../base.js';
import { runEngine, EngineConfig } from '../../services/agentEngine.js';
import type { ToolSchema, Message } from '../../utils/types.js';
import type { SkillDefinition } from '../../skills/skillLoader.js';
import * as fs from 'fs';
import * as path from 'path';

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
      desc += ` [context: ${s.context || 'inline'}]`;
      return desc;
    }).join('\n');

    this.description = `Execute a skill. You MUST use this tool to invoke any available skill.
Skills with [context: inline] will return instructions for YOU to execute.
Skills with [context: fork] will spawn a sub-agent to execute the task in the background and return the final result.
Available skills:\n${skillDescriptions || 'none'}`;
  }

  renderToolUseMessage(args: { skill: string, args?: string }) {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'row' },
      React.createElement(Text, { color: 'magenta' }, '✨ Using skill: '),
      React.createElement(Text, { color: 'magenta', bold: true }, args.skill || 'unknown')
    );
  }

  renderToolResultMessage(args: { skill: string, args?: string }, result: string) {
    return React.createElement(
      Box,
      { paddingLeft: 2, flexDirection: 'row' },
      React.createElement(Text, { color: 'green' }, '✓ Skill completed: '),
      React.createElement(Text, { color: 'green', bold: true }, args.skill || 'unknown')
    );
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
    } else {
      // By default, prevent sub-agents from calling Skill recursively to avoid infinite polling/loops
      allowedTools = tools.filter(t => t.function.name !== 'Skill');
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

    const skillContext = targetSkill.context || 'inline'; // Default to inline (like Claude Code)

    if (skillContext === 'inline') {
      return `[Skill Instructions Loaded (Inline Mode)]\n\nPlease follow these instructions to complete the user's request:\n\n---\n${finalInstructions}\n---\n\nYou are now expected to execute the above skill instructions using the tools available to you.`;
    }

    // --- Fork Context (Sub-Agent Execution) ---
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
        if (event.type === 'debug' && config.isDev) {
          // Log sub-agent API requests to the dev log so they aren't hidden
          const logPath = path.join(process.cwd(), 'lite-agent-dev.log');
          fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] [Sub-Agent: ${skill}] ${event.event === 'request' ? '↑ API Request' : '↓ API Response'} (Loop ${event.data.loop})\n${JSON.stringify(event.data, null, 2)}\n`, 'utf-8');
        } else if (event.type === 'completed') {
          // Extract the final summary and tools used
          const assistantMsgs = event.finalMessages.filter(m => m.role === 'assistant');
          const lastMsg = assistantMsgs[assistantMsgs.length - 1];
          const summary = (lastMsg && lastMsg.content) ? lastMsg.content : 'Skill executed successfully.';
          
          const toolCalls = event.finalMessages.filter(m => m.role === 'tool');
          if (toolCalls.length > 0) {
            const toolNames = toolCalls.map(m => m.name).filter(Boolean);
            finalResult = `${summary}\n\n[System Note: The sub-agent invoked the following tools to complete the task: ${toolNames.join(', ')}]`;
          } else {
            finalResult = summary;
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
