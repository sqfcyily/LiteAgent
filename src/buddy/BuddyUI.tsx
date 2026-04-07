import React, { useState, useEffect, useRef } from 'react';
import { render, Box, Text, Static, useInput, useApp } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import TextInput from 'ink-text-input';
import { Markdown } from '../components/Markdown.js';
import { runEngine, EngineConfig } from '../services/agentEngine.js';
import type { EngineEvent, Message, ToolSchema } from '../utils/types.js';

export class BuddyUI {
  private config: EngineConfig;
  private tools: ToolSchema[];
  private skillInstructions: string;

  constructor(config: EngineConfig, tools: ToolSchema[], skillInstructions: string) {
    this.config = config;
    this.tools = tools;
    this.skillInstructions = skillInstructions;
  }

  async connect(): Promise<void> {
    console.clear();
    const { waitUntilExit } = render(<LiteAgentApp config={this.config} tools={this.tools} skillInstructions={this.skillInstructions} />);
    await waitUntilExit();
  }
}

// ---------------------------------------------------------
// React Root for the Buddy Channel
// ---------------------------------------------------------
type AgentState = 'idle' | 'thinking' | 'working' | 'success' | 'error';

type HistoryItem = 
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'tool'; toolName: string; args: string }
  | { role: 'tool_result'; toolName: string; result: string };

const LiteAgentApp: React.FC<{ config: EngineConfig, tools: ToolSchema[], skillInstructions: string }> = ({ config, tools, skillInstructions }) => {
  const { exit } = useApp();

  const initialSystemPrompt = `You are LiteAgent, a powerful, general-purpose AI assistant. You are a lightweight and precise tool equipped to handle ANY task the user requests—from software development to analysis and beyond. Always use tools when necessary to assist the user effectively. 
Current Working Directory: ${process.cwd()}
Language preference: ${config.language || 'en-US'}.\n\n${skillInstructions}`;
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: initialSystemPrompt }
  ]);
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState('');
  
  // Advanced State Tracking
  const [appState, setAppState] = useState<AgentState>('idle');
  const [statusText, setStatusText] = useState('Ready');
  const [currentStream, setCurrentStream] = useState('');
  const currentStreamRef = useRef(''); // Use ref to safely flush in async loop
  const [frameIdx, setFrameIdx] = useState(0);

  // We keep debugLogs in state in case we want to show a counter or indicator, but we will write to file.
  const [debugLogs, setDebugLogs] = useState<any[]>([]);

  useEffect(() => {
    if (config.isDev) {
      const logPath = path.join(process.cwd(), 'dev.log');
      fs.writeFileSync(logPath, `=== LiteAgent Dev Session Started at ${new Date().toISOString()} ===\n`, 'utf-8');
    }
  }, [config.isDev]);

  const isProcessing = appState === 'thinking' || appState === 'working';

  // Minimal Spinner Dictionary
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const idleIcon = '●';
  const successIcon = '✓';
  const errorIcon = '✖';
  
  const getStatusIcon = () => {
    if (appState === 'idle') return idleIcon;
    if (appState === 'success') return successIcon;
    if (appState === 'error') return errorIcon;
    return spinnerFrames[frameIdx % spinnerFrames.length];
  };

  useEffect(() => {
    // 💡 UX Fix: Disable continuous animations in Dev Mode to allow smooth terminal scrolling
    if (config.isDev) {
      setFrameIdx(0);
      return;
    }

    const speed = isProcessing ? 80 : 800; // Faster for spinner
    const timer = setInterval(() => {
      setFrameIdx(prev => prev + 1);
    }, speed);
    return () => clearInterval(timer);
  }, [isProcessing, config.isDev]);

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      exit();
      return;
    }
    if (trimmed.toLowerCase() === '/dev') {
      setHistory(prev => [...prev, { role: 'assistant', content: 'ℹ️ Dev mode logs are now written to `dev.log` in your current directory. Use `tail -f dev.log` in another terminal to monitor.' }]);
      setInput('');
      return;
    }

    const userMsg = { role: 'user' as const, content: text };
    setHistory(prev => [...prev, userMsg]);

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    
    setInput('');
    setAppState('thinking');
    setStatusText('Thinking...');
    setCurrentStream('');
    setDebugLogs([]); // Clear logs for new turn

    try {
      const stream = runEngine(newMessages, tools, config);
      for await (const event of stream) {
        switch (event.type) {
          case 'debug':
            if (config.isDev) {
              const logPath = path.join(process.cwd(), 'dev.log');
              const logEntry = `[${new Date().toISOString()}] ${event.event === 'request' ? '↑ API Request' : '↓ API Response'} (Loop ${event.data.loop})\n${JSON.stringify(event.data, null, 2)}\n\n`;
              fs.appendFileSync(logPath, logEntry, 'utf-8');
            }
            break;
          case 'thinking':
            setAppState('thinking');
            setStatusText('Thinking...');
            setCurrentStream(event.content);
            currentStreamRef.current = event.content;
            break;
          case 'tool_start':
            setAppState('working');
            setStatusText(`Executing Tool [${event.toolName}]...`);
            // 💡 Flush the "thought process" before the tool execution into history
            setHistory(prev => {
              const newHist = [...prev];
              // Only push if there's actual thinking content before the tool call
              if (currentStreamRef.current && currentStreamRef.current.trim()) {
                newHist.push({ role: 'assistant', content: currentStreamRef.current.trim() });
              }
              newHist.push({ role: 'tool', toolName: event.toolName, args: event.args });
              return newHist;
            });
            setCurrentStream('');
            currentStreamRef.current = '';
            break;
          case 'tool_end':
            setAppState('thinking');
            setStatusText(`Tool [${event.toolName}] finished.`);
            setHistory(prev => [...prev, { role: 'tool_result', toolName: event.toolName, result: event.result }]);
            break;
          case 'completed':
            setMessages(event.finalMessages);
            if (event.content && event.content.trim()) {
              setHistory(prev => [...prev, { role: 'assistant', content: event.content.trim() }]);
            } else if (currentStreamRef.current && currentStreamRef.current.trim()) {
              setHistory(prev => [...prev, { role: 'assistant', content: currentStreamRef.current.trim() }]);
            }
            setCurrentStream('');
            currentStreamRef.current = '';
            
            // Go straight to idle to instantly remove the "Thinking..." block from the screen.
            setAppState('idle');
            setStatusText('Ready');
            break;
          case 'error':
            const errorMsg = { role: 'assistant' as const, content: `❌ Error: ${event.error.message}` };
            setMessages([...newMessages, errorMsg]);
            setHistory(prev => [...prev, errorMsg]);
            setCurrentStream('');
            
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
      {/* 📜 Top Header */}
      <Box paddingX={1} borderBottom={true} borderStyle="single" borderColor="cyan" justifyContent="space-between">
        <Text bold color="cyan">🚀 LiteAgent Workspace</Text>
        <Text color="gray">Type /dev for logs</Text>
      </Box>

      {/* 📜 Scrollable History via Static */}
      <Static items={history}>
        {(msg, index) => (
          <Box key={index} flexDirection="column" marginTop={1} marginBottom={1}>
            {msg.role === 'user' && (
              <>
                <Box marginBottom={1}><Text bold color="white">You</Text></Box>
                <Box paddingLeft={0}><Markdown>{msg.content}</Markdown></Box>
              </>
            )}
            
            {msg.role === 'assistant' && (
              <>
                <Box marginBottom={1}><Text bold color="cyan">■ LiteAgent</Text></Box>
                <Box paddingLeft={2}><Markdown>{msg.content}</Markdown></Box>
              </>
            )}

            {msg.role === 'tool' && (
              <Box paddingLeft={2} flexDirection="row">
                <Text color="yellow">⚙️  Calling Tool: </Text>
                <Text color="yellow" bold>{msg.toolName}</Text>
              </Box>
            )}

            {msg.role === 'tool_result' && (
              <Box paddingLeft={2} flexDirection="row">
                <Text color="green">✓  Tool Result: </Text>
                <Text color="green" bold>{msg.toolName}</Text>
              </Box>
            )}
          </Box>
        )}
      </Static>

      <Box flexDirection="column">
        {/* Active Processing Area */}
        {(appState === 'thinking' || appState === 'working') && (
          <Box flexDirection="column" marginTop={1} paddingLeft={2} marginBottom={1}>
            <Box>
              <Text color="yellow" italic>
                {appState === 'thinking' ? 'Thinking: ' : 'Working: '} {statusText}
              </Text>
            </Box>
            {currentStream.trim() ? (
              <Box marginTop={1}>
                <Markdown>{currentStream}</Markdown>
              </Box>
            ) : null}
          </Box>
        )}

        {/* Input Area (Always rendered at the bottom) */}
        {(appState === 'idle' || appState === 'success' || appState === 'error') && (
          <Box flexDirection="column" borderTop={true} borderStyle="single" borderColor="gray" paddingX={1} paddingTop={1}>
            {/* Status Bar */}
            <Box marginBottom={1} justifyContent="space-between">
              <Box>
                <Text color="cyan">LiteAgent (CLI)</Text>
                <Text color="gray"> · {config.model} · {process.cwd()}</Text>
              </Box>
              <Box>
                <Text color="gray">ctrl+c exit</Text>
              </Box>
            </Box>

            {/* Input Field */}
            <Box>
              <Box marginRight={1}>
                <Text color={appState === 'error' ? 'red' : 'cyan'}>▐</Text>
              </Box>
              <Box flexGrow={1}>
                {/* @ts-ignore */}
                <TextInput 
                  value={input} 
                  onChange={setInput} 
                  onSubmit={handleSubmit} 
                  placeholder="Type a message... (Logs are in dev.log)" 
                />
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
};
