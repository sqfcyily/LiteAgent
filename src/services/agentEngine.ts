import { fetchStream, LLMConfig } from './llmClient.js';
import type { Message, EngineEvent, ToolSchema, ToolCall } from '../utils/types.js';
import { runTool } from '../tools/index.js';

export interface EngineConfig extends LLMConfig {
  maxLoops?: number;
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
  const maxLoops = config.maxLoops || 10;
  let loops = 0;
  
  // Clone to avoid mutating the React state directly
  const messages = [...initialMessages];

  while (loops < maxLoops) {
    loops++;
    yield { type: 'thinking', content: `Reasoning loop ${loops}...` };

    let currentText = '';
    const currentToolCalls: Record<number, any> = {};

    // 1. Fetch LLM stream
    const stream = fetchStream(messages, tools, config);
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
    if (toolCallsArr.length > 0) {
      for (const tc of toolCallsArr) {
        yield { type: 'tool_start', toolName: tc.function.name, args: tc.function.arguments };
        try {
          const argsObj = JSON.parse(tc.function.arguments || '{}');
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
