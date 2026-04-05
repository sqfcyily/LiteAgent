import { fetchStream, LLMConfig } from './llm.js';
import type { Message, EngineEvent, ToolSchema, ToolCall } from './types.js';
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
        yield { type: 'thinking', content: currentText };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!currentToolCalls[tc.index]) {
            currentToolCalls[tc.index] = { id: tc.id, type: 'function', function: { name: tc.function.name, arguments: '' } };
          }
          if (tc.function?.arguments) {
            currentToolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }
    }

    // 2. Append Assistant Response to Context
    const toolCallsArr = Object.values(currentToolCalls);
    messages.push({
      role: 'assistant',
      content: currentText,
      tool_calls: toolCallsArr.length > 0 ? toolCallsArr : undefined
    });

    // 3. Execute Tools if any
    if (toolCallsArr.length > 0) {
      for (const tc of toolCallsArr) {
        yield { type: 'tool_start', toolName: tc.function.name, args: tc.function.arguments };
        try {
          const result = await runTool(tc.function.name, JSON.parse(tc.function.arguments));
          yield { type: 'tool_end', toolName: tc.function.name, result };
          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
            name: tc.function.name
          });
        } catch (e: any) {
          yield { type: 'error', error: e };
          messages.push({
            role: 'tool',
            content: `Error executing tool: ${e.message}`,
            tool_call_id: tc.id,
            name: tc.function.name
          });
        }
      }
    } else {
      // 4. Break if no tools were called (Task Complete)
      yield { type: 'completed', content: currentText, finalMessages: messages };
      break;
    }
  }

  if (loops >= maxLoops) {
    yield { type: 'error', error: new Error('Max loops reached.') };
  }
}
