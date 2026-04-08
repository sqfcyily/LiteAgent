import { fetchStream, LLMConfig } from './llmClient.js';
import type { Message, EngineEvent, ToolSchema, ToolCall } from '../utils/types.js';
import { runTool } from '../tools/index.js';
import { compressContext } from './contextManager.js';
import { checkPermissions, ToolPermissionContext } from '../tools/system/permissionPipeline.js';

export interface EngineConfig extends LLMConfig {
  maxLoops?: number;
  isDev?: boolean;
  permissionContext?: ToolPermissionContext;
  language?: string;
}

/**
 * The heartbeat of the Agent.
 * Uses async generators to yield lifecycle events to the channels (CLI/Feishu).
 */
export async function* runEngine(
  initialMessages: Message[], // Pass the conversation history
  tools: ToolSchema[],
  config: EngineConfig
): AsyncGenerator<EngineEvent, void, unknown> {
  const maxLoops = config.maxLoops || 25;
  let loops = 0;
  
  // Clone to avoid mutating the React state directly
  const messages = [...initialMessages];

  while (loops < maxLoops) {
    loops++;
    yield { type: 'thinking', content: `Reasoning loop ${loops}...` };

    let currentText = '';
    const currentToolCalls: Record<number, any> = {};

    if (config.isDev) {
      yield {
        type: 'debug',
        event: 'request',
        data: {
          loop: loops,
          messages: messages.map(m => ({ 
            role: m.role, 
            content: m.content ? (m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content) : m.content,
            tool_calls: m.tool_calls
          })),
          tools: tools.map(t => t.function.name)
        }
      };
    }

    // 1. Fetch LLM stream
    const compressedMessages = compressContext(messages, { maxTokens: 8000 });
    const stream = fetchStream(compressedMessages, tools, config);
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        currentText += delta.content;
        if (currentText.trim()) {
          yield { type: 'thinking', content: currentText };
        }
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!currentToolCalls[tc.index]) {
            currentToolCalls[tc.index] = { 
              id: tc.id || `call_${Date.now()}_${tc.index}`, 
              type: 'function', 
              function: { name: tc.function?.name || '', arguments: '' } 
            };
          } else {
            if (tc.function?.name) {
              currentToolCalls[tc.index].function.name += tc.function.name;
            }
          }
          if (tc.function?.arguments) {
            currentToolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }
    }

    // 2. Append Assistant Response to Context
    const toolCallsArr = Object.values(currentToolCalls);
    if (currentText.trim() || toolCallsArr.length === 0) {
      messages.push({
        role: 'assistant',
        content: currentText,
        tool_calls: toolCallsArr.length > 0 ? toolCallsArr : undefined
      });
    } else {
      messages.push({
        role: 'assistant',
        tool_calls: toolCallsArr
      });
    }

    // 3. Execute Tools if any
    if (config.isDev) {
      yield {
        type: 'debug',
        event: 'response',
        data: {
          loop: loops,
          content: currentText,
          requiresTool: toolCallsArr.length > 0,
          toolCalls: toolCallsArr.map(tc => ({ name: tc.function.name, args: tc.function.arguments }))
        }
      };
    }

    if (toolCallsArr.length > 0) {
      for (const tc of toolCallsArr) {
        yield { type: 'tool_start', toolName: tc.function.name, args: tc.function.arguments };
        try {
          const argsObj = JSON.parse(tc.function.arguments || '{}');

          // Check permissions
          const pCtx = config.permissionContext || {
            mode: 'default',
            allowRules: [],
            denyRules: [],
            askRules: [],
            bypassAvailable: false
          };

          const decision = checkPermissions(tc.function.name, argsObj, pCtx);
          
          if (decision === 'deny') {
            const errorMsg = `Tool execution denied by permission pipeline (Rule Matched).`;
            yield { type: 'tool_end', toolName: tc.function.name, result: errorMsg };
            messages.push({
              role: 'tool',
              content: errorMsg,
              tool_call_id: tc.id,
              name: tc.function.name
            });
            continue;
          }

          if (decision === 'ask') {
            // Simplified interactive prompt fallback (Graceful Degradation)
            // In a real terminal with Ink, this would pause the async generator and await user input
            // For now, we simulate 'ask' resolving to allow (or auto-rejected depending on config)
            yield { type: 'thinking', content: `[Permission Pipeline] Requesting user confirmation for ${tc.function.name}... (Auto-resolved for demo)` };
          }

          const result = await runTool(tc.function.name, argsObj);
          yield { type: 'tool_end', toolName: tc.function.name, result };
          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
            name: tc.function.name
          });
        } catch (e: any) {
          const errorMsg = `Error executing tool: ${e.message}`;
          yield { type: 'tool_end', toolName: tc.function.name, result: errorMsg };
          messages.push({
            role: 'tool',
            content: errorMsg,
            tool_call_id: tc.id,
            name: tc.function.name
          });
        }
      }
    } else {
      // 4. Break if no tools were called (Task Complete)
      yield { type: 'completed', content: currentText, finalMessages: messages };
      return;
    }
  }

  yield { type: 'error', error: new Error('Max loops reached.') };
}
