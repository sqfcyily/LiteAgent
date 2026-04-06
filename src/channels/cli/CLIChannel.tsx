import React, { useState, useEffect } from 'react';
import { render, Box, Text, Static } from 'ink';
import TextInput from 'ink-text-input';
import { Markdown } from '../../ui/components/Markdown.js';
import { runEngine, EngineConfig } from '../../core/engine.js';
import type { Channel } from '../base.js';
import type { EngineEvent, Message, ToolSchema } from '../../core/types.js';

export class CLIChannel implements Channel {
  private config: EngineConfig;
  private tools: ToolSchema[];

  constructor(config: EngineConfig, tools: ToolSchema[]) {
    this.config = config;
    this.tools = tools;
  }

  async connect(): Promise<void> {
    console.clear();
    const { waitUntilExit } = render(<PixPalApp config={this.config} tools={this.tools} />);
    await waitUntilExit();
  }

  onMessage() {}
  async sendMessage() { return ''; }
  async updateMessage() {}
  async renderEngineStream() {}
}

// ---------------------------------------------------------
// React Root for the CLI Channel
// ---------------------------------------------------------
type RobotState = 'idle' | 'thinking' | 'working' | 'success' | 'error';

const PixPalApp: React.FC<{ config: EngineConfig, tools: ToolSchema[] }> = ({ config, tools }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: `You are PixPal, a helpful pixel-art assistant. Always use tools when necessary. Language preference: ${config.language || 'en-US'}.` }
  ]);
  
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  
  // Advanced State Tracking
  const [appState, setAppState] = useState<RobotState>('idle');
  const [statusText, setStatusText] = useState('Ready');
  const [currentStream, setCurrentStream] = useState('');
  const [frameIdx, setFrameIdx] = useState(0);
  
  const isProcessing = appState === 'thinking' || appState === 'working';

  // 🤖 Emotion & Animation Dictionary
  const robotFrames: Record<RobotState, string[]> = {
    idle: [
      " ▄▀▀▄ \n █--█ \n ▀▄▄▀ ", // Waiting (Blinking)
      " ▄▀▀▄ \n █oo█ \n ▀▄▄▀ "  // Waiting (Eyes open)
    ],
    thinking: [
      " ▄▀▀▄ \n █··█ \n ▀▄▄▀ ", // Thinking (Looking left)
      " ▄▀▀▄ \n █••█ \n ▀▄▄▀ "  // Thinking (Looking right)
    ],
    working: [
      " ▄▀▀▄ \n █><█ \n ▀▄▄▀ ", // Working hard (Straining)
      " ▄▀▀▄ \n █><█ \n ▀▄▄▀ "
    ],
    success: [
      " ▄▀▀▄ \n █^^█ \n ▀▄▄▀ ", // Happy / Success
      " ▄▀▀▄ \n █^^█ \n ▀▄▄▀ "
    ],
    error: [
      " ▄▀▀▄ \n █xx█ \n ▀▄▄▀ ", // Dead / Error
      " ▄▀▀▄ \n █XX█ \n ▀▄▄▀ "
    ]
  };

  useEffect(() => {
    const speed = isProcessing ? 200 : 800;
    const timer = setInterval(() => {
      setFrameIdx(prev => (prev + 1) % 2);
    }, speed);
    return () => clearInterval(timer);
  }, [isProcessing]);

  const handleSubmit = async (text: string) => {
    if (!text.trim()) return;
    if (text.trim().toLowerCase() === 'exit' || text.trim().toLowerCase() === 'quit') {
      process.exit(0);
    }

    const userMsg = { role: 'user' as const, content: text };
    setHistory(prev => [...prev, userMsg]);

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    
    setInput('');
    setAppState('thinking');
    setStatusText('Thinking...');
    setCurrentStream('');

    try {
      const stream = runEngine(newMessages, tools, config);
      for await (const event of stream) {
        switch (event.type) {
          case 'thinking':
            setAppState('thinking');
            setStatusText('Thinking...');
            setCurrentStream(event.content);
            break;
          case 'tool_start':
            setAppState('working');
            setStatusText(`Executing Tool [${event.toolName}]...`);
            break;
          case 'tool_end':
            setAppState('thinking');
            setStatusText(`Tool [${event.toolName}] finished.`);
            break;
          case 'completed':
            setMessages(event.finalMessages);
            setHistory(prev => [...prev, { role: 'assistant', content: event.content }]);
            setCurrentStream('');
            
            // Brief success celebration before going back to idle
            setAppState('success');
            setTimeout(() => setAppState('idle'), 2500);
            break;
          case 'error':
            const errorMsg = { role: 'assistant' as const, content: `❌ Error: ${event.error.message}` };
            setMessages([...newMessages, errorMsg]);
            setHistory(prev => [...prev, errorMsg]);
            setCurrentStream('');
            
            // Show error state before resetting
            setAppState('error');
            setTimeout(() => setAppState('idle'), 3000);
            break;
        }
      }
    } catch (e: any) {
      const fatalErrorMsg = { role: 'assistant' as const, content: `❌ Fatal Error: ${e.message}` };
      setMessages([...newMessages, fatalErrorMsg]);
      setHistory(prev => [...prev, fatalErrorMsg]);
      setCurrentStream('');
      
      setAppState('error');
      setTimeout(() => setAppState('idle'), 3000);
    }
  };

  return (
    <>
      {/* Claude Code Style History (Using Static to flush completed items and prevent dynamic jump) */}
      <Static items={history}>
        {(msg, index) => (
          <Box key={index} flexDirection="column" paddingY={0} marginTop={1}>
            <Text bold color={msg.role === 'user' ? 'blue' : 'green'}>
              {msg.role === 'user' ? 'You:' : 'PixPal:'}
            </Text>
            {msg.role === 'user' ? (
              <Text>{msg.content}</Text>
            ) : (
              <Box paddingLeft={2} flexDirection="column">
                <Markdown>{msg.content}</Markdown>
              </Box>
            )}
          </Box>
        )}
      </Static>

      <Box flexDirection="column">
        {/* Active Processing Area (The Diorama & Live Stream) */}
        {isProcessing && (
          <Box flexDirection="column" borderStyle="round" borderColor={appState === 'working' ? 'yellow' : 'cyan'} paddingX={2} marginY={1}>
            <Box alignItems="center">
              <Box marginRight={2}>
                <Text bold color={appState === 'working' ? 'yellow' : 'cyan'}>
                  {robotFrames[appState][frameIdx]}
                </Text>
              </Box>
              <Text color={appState === 'working' ? 'yellow' : 'cyan'}>{statusText}</Text>
            </Box>
            <Box marginTop={1}>
              <Markdown>{currentStream}</Markdown>
            </Box>
          </Box>
        )}

        {/* Input Area (Idle / Success / Error) */}
        {!isProcessing && (
          <Box marginTop={1}>
            <Box marginRight={1}>
              <Text color={appState === 'success' ? 'green' : appState === 'error' ? 'red' : 'blue'}>
                {robotFrames[appState][frameIdx]}
              </Text>
            </Box>
            <Box flexDirection="column" justifyContent="center">
              <Box>
                <Text bold color="yellow"> {'> '} </Text>
                {/* @ts-ignore */}
                <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
};
