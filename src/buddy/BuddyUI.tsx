import React, { useState, useEffect } from 'react';
import { render, Box, Text, Static, useInput, useApp } from 'ink';
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

const LiteAgentApp: React.FC<{ config: EngineConfig, tools: ToolSchema[], skillInstructions: string }> = ({ config, tools, skillInstructions }) => {
  const { exit } = useApp();

  const initialSystemPrompt = `You are LiteAgent, a powerful, general-purpose AI assistant. You are a lightweight and precise tool equipped to handle ANY task the user requests—from software development to analysis and beyond. Always use tools when necessary to assist the user effectively. 
Current Working Directory: ${process.cwd()}
Language preference: ${config.language || 'en-US'}.\n\n${skillInstructions}`;
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: initialSystemPrompt }
  ]);
  
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  
  // Advanced State Tracking
  const [appState, setAppState] = useState<AgentState>('idle');
  const [statusText, setStatusText] = useState('Ready');
  const [currentStream, setCurrentStream] = useState('');
  const [frameIdx, setFrameIdx] = useState(0);

  // Dev Mode & Inspector
  const [isDevMenuOpen, setIsDevMenuOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<any[]>([]);

  useInput((input, key) => {
    if (key.escape && isDevMenuOpen) {
      setIsDevMenuOpen(false);
    }
  });

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
      if (config.isDev) {
        setIsDevMenuOpen(true);
      } else {
        setHistory(prev => [...prev, { role: 'assistant', content: '⚠️ Dev mode is not enabled. Restart with `npm run dev`.' }]);
      }
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
            setDebugLogs(prev => {
              const newLogs = [...prev, { event: event.event, data: event.data }];
              return newLogs.slice(-20); // Keep last 20 for full screen
            });
            break;
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
            if (event.content && event.content.trim()) {
              setHistory(prev => [...prev, { role: 'assistant', content: event.content }]);
            } else {
              setHistory(prev => [...prev, { role: 'assistant', content: '✅ Task completed successfully.' }]);
            }
            setCurrentStream('');
            
            setAppState('success');
            setTimeout(() => setAppState('idle'), 2500);
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

  if (config.isDev) {
    return (
      <Box flexDirection="row" height={process.stdout.rows - 1} width="100%">
        {/* Left Pane: Chat Interface */}
        <Box width="60%" flexDirection="column" borderRight={true} borderStyle="single" borderColor="gray" paddingRight={1}>
          <Box borderBottom={true} borderStyle="single" borderColor="cyan" marginBottom={1}>
            <Text bold color="cyan">🚀 LiteAgent Workspace</Text>
          </Box>
          
          <Box flexGrow={1} flexDirection="column" overflowY="auto">
            {history.map((msg, index) => (
              <Box key={index} flexDirection="column" marginTop={1} marginBottom={1}>
                <Box marginBottom={1}>
                  {msg.role === 'user' ? (
                    <Text bold color="white">You</Text>
                  ) : (
                    <Text bold color="cyan">■ LiteAgent</Text>
                  )}
                </Box>
                <Box paddingLeft={msg.role === 'user' ? 0 : 2}>
                  {msg.role === 'assistant' || msg.role === 'user' ? (
                    <Markdown>{msg.content}</Markdown>
                  ) : (
                    <Text color="gray">{msg.content}</Text>
                  )}
                </Box>
              </Box>
            ))}
            
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
          </Box>

          <Box flexDirection="column" borderTop={true} borderStyle="single" borderColor="gray" paddingTop={1}>
            <Box marginBottom={1} justifyContent="space-between">
              <Box><Text color="gray">{config.model} · {process.cwd()}</Text></Box>
              <Box><Text color="gray">ctrl+c exit</Text></Box>
            </Box>
            <Box>
              <Box marginRight={1}>
                <Text color={appState === 'error' ? 'red' : 'cyan'}>▐</Text>
              </Box>
              <Box flexGrow={1}>
                {/* @ts-ignore */}
                <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="Type a message..." />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Right Pane: Dev Logs */}
        <Box width="40%" flexDirection="column" paddingLeft={1}>
          <Box borderBottom={true} borderStyle="single" borderColor="yellow" marginBottom={1}>
            <Text bold color="yellow">⚙️ Dev Logs Inspector (Real-time)</Text>
          </Box>
          <Box flexGrow={1} flexDirection="column" overflowY="auto">
            {debugLogs.length === 0 ? (
              <Text color="gray">No logs recorded yet...</Text>
            ) : (
              debugLogs.map((log, i) => (
                <Box key={i} flexDirection="column" marginBottom={1}>
                  <Text color={log.event === 'request' ? 'blue' : 'green'} bold>
                    {log.event === 'request' ? '↑ API Request' : '↓ API Response'} (Loop {log.data.loop})
                  </Text>
                  <Text color="gray">{JSON.stringify(log.data, null, 2)}</Text>
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // Normal Mode: Native Streaming Layout (No fixed height)
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
            <Box marginBottom={1}>
              {msg.role === 'user' ? (
                <Text bold color="white">You</Text>
              ) : (
                <Text bold color="cyan">■ LiteAgent</Text>
              )}
            </Box>
            <Box paddingLeft={msg.role === 'user' ? 0 : 2}>
              {msg.role === 'assistant' || msg.role === 'user' ? (
                <Markdown>{msg.content}</Markdown>
              ) : (
                <Text color="gray">{msg.content}</Text>
              )}
            </Box>
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

        {/* Dynamic Bottom Area: Dev Logs OR Input */}
        {isDevMenuOpen ? (
          <Box flexDirection="column" borderStyle="round" borderColor="yellow" marginY={1}>
            <Box borderBottom={false} marginBottom={1} justifyContent="space-between">
              <Text bold color="yellow">⚙️ Dev Logs Inspector (Recent)</Text>
              <Text color="gray">esc to close</Text>
            </Box>
            {debugLogs.length === 0 ? (
              <Text color="gray">No logs recorded yet...</Text>
            ) : (
              debugLogs.slice(-3).map((log, i) => (
                <Box key={i} flexDirection="column" marginBottom={1}>
                  <Text color={log.event === 'request' ? 'blue' : 'green'} bold>
                    {log.event === 'request' ? '↑ API Request' : '↓ API Response'} (Loop {log.data.loop})
                  </Text>
                  <Text color="gray">{JSON.stringify(log.data).substring(0, 150)}{JSON.stringify(log.data).length > 150 ? '...' : ''}</Text>
                </Box>
              ))
            )}
          </Box>
        ) : (
          (appState === 'idle' || appState === 'success' || appState === 'error') && (
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

              {/* Input Area */}
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
                    placeholder="Type a message or /dev for logs..." 
                  />
                </Box>
              </Box>
            </Box>
          )
        )}
      </Box>
    </>
  );
};
