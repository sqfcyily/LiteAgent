import React, { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import { DioramaStage, DioramaState } from '../../ui/components/Diorama/Stage.js';
import type { Channel } from '../base.js';
import type { EngineEvent } from '../../core/types.js';

export class CLIChannel implements Channel {
  private renderInstance: any;

  async connect(): Promise<void> {
    console.clear();
    console.log('PixelTasker CLI Initialized. Waiting for tasks...');
  }

  onMessage(callback: (message: string) => void): void {
    // In a real CLI, we'd use process.stdin.on('data') or a prompt loop.
    // For now, we simulate an input from the user.
  }

  async sendMessage(content: string): Promise<string> {
    console.log(content);
    return 'cli-msg-1';
  }

  async updateMessage(messageId: string, content: string): Promise<void> {
    // Updates are handled natively by React/Ink via state changes.
  }

  async renderEngineStream(prompt: string, stream: AsyncGenerator<EngineEvent, void, unknown>): Promise<void> {
    this.renderInstance = render(<CLIRootApp prompt={prompt} stream={stream} />);
    
    // Wait until the stream finishes to unmount the React app if necessary
    for await (const event of stream) {
       // Loop consumed by React hook inside CLIRootApp, this is just to keep async context open
    }
  }
}

// ---------------------------------------------------------
// React Root for the CLI Channel
// ---------------------------------------------------------
const CLIRootApp: React.FC<{ prompt: string, stream: AsyncGenerator<EngineEvent, void, unknown> }> = ({ prompt, stream }) => {
  const [dioramaState, setDioramaState] = useState<DioramaState>({ status: 'Pending', message: 'Ready...' });
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const consumeStream = async () => {
      for await (const event of stream) {
        switch (event.type) {
          case 'thinking':
            setDioramaState(prev => ({ ...prev, status: 'In_Progress', message: event.content }));
            break;
          case 'tool_start':
            setDioramaState(prev => ({ ...prev, status: 'In_Progress', message: 'Using tool...', toolInfo: `Executing [${event.toolName}] with args: ${event.args}` }));
            setLogs(prev => [...prev, `> Starting Tool: ${event.toolName}`]);
            break;
          case 'tool_end':
            setDioramaState(prev => ({ ...prev, status: 'In_Progress', message: 'Tool finished. Resuming thought...', toolInfo: `Result: ${event.result}` }));
            setLogs(prev => [...prev, `> Finished Tool: ${event.toolName}`]);
            break;
          case 'completed':
            setDioramaState({ status: 'Completed', message: event.content });
            setLogs(prev => [...prev, `> Task Completed.`]);
            break;
          case 'error':
            setDioramaState({ status: 'Failed', message: event.error.message });
            setLogs(prev => [...prev, `> Error: ${event.error.message}`]);
            break;
        }
      }
    };
    consumeStream();
  }, [stream]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="yellow">User Input: {prompt}</Text>
      <DioramaStage state={dioramaState} />
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>--- System Logs ---</Text>
        {logs.slice(-3).map((log, i) => <Text key={i} dimColor>{log}</Text>)}
      </Box>
    </Box>
  );
};
