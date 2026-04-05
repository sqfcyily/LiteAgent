import React, { useState, useEffect } from 'react';
import { render, Box, Text, Static } from 'ink';
import TextInput from 'ink-text-input';
import Markdown from 'ink-markdown';
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

  // Not used in this persistent UI model, handled inside React
  onMessage() {}
  async sendMessage() { return ''; }
  async updateMessage() {}
  async renderEngineStream() {}
}

// ---------------------------------------------------------
// React Root for the CLI Channel
// ---------------------------------------------------------
const PixPalApp: React.FC<{ config: EngineConfig, tools: ToolSchema[] }> = ({ config, tools }) => {
  // messages array contains the full context needed for the LLM
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: `You are PixPal, a helpful pixel-art assistant. Always use tools when necessary. Language preference: ${config.language || 'en-US'}.` }
  ]);
  
  // history array ONLY contains fully completed messages for the Static renderer
  const [history, setHistory] = useState<Message[]>([]);

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('Ready');
  const [currentStream, setCurrentStream] = useState('');
  
  // Pixel Art Animation state
  const [frameIdx, setFrameIdx] = useState(0);
  
  // Retro Pixel Robot Art
  const idleFrames = [
    " ▄▀▀▄ \n █--█ \n ▀▄▄▀ ",
    " ▄▀▀▄ \n █oo█ \n ▀▄▄▀ "
  ];
  const workFrames = [
    " ▄▀▀▄ \n █><█ \n ▀▄▄▀ ",
    " ▄▀▀▄ \n █><█ \n ▀▄▄▀ "
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIdx(prev => (prev + 1) % 2);
    }, isProcessing ? 200 : 800);
    return () => clearInterval(timer);
  }, [isProcessing]);

  const handleSubmit = async (text: string) => {
    if (!text.trim()) return;
    if (text.trim().toLowerCase() === 'exit' || text.trim().toLowerCase() === 'quit') {
      process.exit(0);
    }

    const userMsg = { role: 'user' as const, content: text };
    
    // 1. Immediately push user's text to Static History so it permanently renders
    setHistory(prev => [...prev, userMsg]);

    // 2. Append to full LLM context
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    
    setInput('');
    setIsProcessing(true);
    setStatusText('Thinking...');
    setCurrentStream('');

    try {
      const stream = runEngine(newMessages, tools, config);
      for await (const event of stream) {
        switch (event.type) {
          case 'thinking':
            setStatusText('Thinking...');
            setCurrentStream(event.content);
            break;
          case 'tool_start':
            setStatusText(`Executing Tool [${event.toolName}]...`);
            break;
          case 'tool_end':
            setStatusText(`Tool [${event.toolName}] finished.`);
            break;
          case 'completed':
            // 3. Update full LLM context with final response
            setMessages(event.finalMessages);
            // 4. Push final response to Static History to permanently render
            setHistory(prev => [...prev, { role: 'assistant', content: event.content }]);
            
            setCurrentStream('');
            setIsProcessing(false);
            break;
          case 'error':
            const errorMsg = { role: 'assistant' as const, content: `❌ Error: ${event.error.message}` };
            setMessages([...newMessages, errorMsg]);
            setHistory(prev => [...prev, errorMsg]);
            
            setCurrentStream('');
            setIsProcessing(false);
            break;
        }
      }
    } catch (e: any) {
      const fatalErrorMsg = { role: 'assistant' as const, content: `❌ Fatal Error: ${e.message}` };
      setMessages([...newMessages, fatalErrorMsg]);
      setHistory(prev => [...prev, fatalErrorMsg]);
      
      setCurrentStream('');
      setIsProcessing(false);
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="magenta">✨ PixPal Terminal Initialized. Type 'exit' to quit.</Text>
      </Box>

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

      {/* Active Processing Area (The Diorama & Live Stream) */}
      {isProcessing && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} marginY={1}>
          <Box alignItems="center">
            <Box marginRight={2}>
              <Text bold color="cyan">{workFrames[frameIdx]}</Text>
            </Box>
            <Text color="yellow">{statusText}</Text>
          </Box>
          <Box marginTop={1}>
            {/* Streamed partial markdown might look funky briefly, but Text provides stable fallback */}
            <Markdown>{currentStream}</Markdown>
          </Box>
        </Box>
      )}

      {/* Input Area */}
      {!isProcessing && (
        <Box marginTop={1}>
          <Box marginRight={1}>
            <Text color="blue">{idleFrames[frameIdx]}</Text>
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
  );
};