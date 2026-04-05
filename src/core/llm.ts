import type { Message, ToolSchema } from './types';

// Core dependencies for network requests
export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Handles communication with any OpenAI-compatible API.
 * Emits raw stream chunks for parsing.
 */
export async function* fetchStream(
  messages: Message[],
  tools: ToolSchema[],
  config: LLMConfig
): AsyncGenerator<any, void, unknown> {
  const url = `${config.baseUrl}/chat/completions`;
  
  const payload = {
    model: config.model,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    stream: true,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`LLM API Error: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Response body is missing');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
        try {
          const dataStr = line.slice(6).trim();
          if (dataStr) {
            yield JSON.parse(dataStr);
          }
        } catch (e) {
          // Ignore partial or malformed chunks in SSE stream
        }
      }
    }
  }
}
