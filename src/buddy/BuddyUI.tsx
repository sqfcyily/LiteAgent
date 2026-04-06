import React, { useState, useEffect } from 'react';
import { render, Box, Text, Static, useInput } from 'ink';
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
    console.log('\x1b[35m✨ PixPal Terminal Initialized. Type \'exit\' to quit.\x1b[0m\n');
    const { waitUntilExit } = render(<PixPalApp config={this.config} tools={this.tools} skillInstructions={this.skillInstructions} />);
    await waitUntilExit();
  }
}

// ---------------------------------------------------------
// React Root for the Buddy Channel
// ---------------------------------------------------------
type RobotState = 'idle' | 'thinking' | 'working' | 'success' | 'error';

const PixPalApp: React.FC<{ config: EngineConfig, tools: ToolSchema[], skillInstructions: string }> = ({ config, tools, skillInstructions }) => {
  const initialSystemPrompt = `You are PixPal, a powerful, general-purpose AI assistant. Your name reflects your lightweight and precise nature, like a pixel, but you are equipped to handle ANY task the user requests—from software development to analysis and beyond. Always use tools when necessary to assist the user effectively. Language preference: ${config.language || 'en-US'}.\n\n${skillInstructions}`;
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: initialSystemPrompt }
  ]);
  
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  
  // Advanced State Tracking
  const [appState, setAppState] = useState<RobotState>('idle');
  const [statusText, setStatusText] = useState('Ready');
  const [currentStream, setCurrentStream] = useState('');
  const [frameIdx, setFrameIdx] = useState(0);

  // Dev Mode & Inspector
  const [showInspector, setShowInspector] = useState(config.isDev || false);
  const [debugLogs, setDebugLogs] = useState<any[]>([]);

  useInput((input, key) => {
    if (key.ctrl && input === 'i') {
      setShowInspector(prev => !prev);
    }
  });

  const isProcessing = appState === 'thinking' || appState === 'working';

  // 🐾 Cute Line-Art Cat Animation Dictionary
  const robotFrames: Record<RobotState, string[]> = {
    idle: [
      "  /\\_/\\  \n ( o.o ) \n  > ^ <  ",
      "  /\\_/\\  \n ( -.- ) \n  > ^ <  "
    ],
    thinking: [
      "  /\\_/\\ 💡\n ( o.- ) \n  > ^ <  ",
      "  /\\_/\\  \n ( o.- )💡\n  > ^ <  "
    ],
    working: [
      "  /\\_/\\ ⚡\n ( >.< ) \n  > ^ <  ",
      "  /\\_/\\  \n ( >_< )⚡\n  > ^ <  "
    ],
    success: [
      "  /\\_/\\ ✨\n ( ^.^ ) \n  > ^ <  ",
      "  /\\_/\\  \n ( ^O^ )✨\n  \\ ^ /  "
    ],
    error: [
      "  /\\_/\\ 💧\n ( x.x ) \n  > ~ <  ",
      "  /\\_/\\  \n ( X.X )💧\n  > ~ <  "
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
    setDebugLogs([]); // Clear logs for new turn

    try {
      const stream = runEngine(newMessages, tools, config);
      for await (const event of stream) {
        switch (event.type) {
          case 'debug':
            setDebugLogs(prev => {
              const newLogs = [...prev, { event: event.event, data: event.data }];
              return newLogs.slice(-10); // Keep last 10
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

  return (
    <>
      {/* Claude Code Style History */}
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
        {/* Active Processing Area */}
        {(appState === 'thinking' || appState === 'working') && (
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
              {currentStream.trim() ? <Markdown>{currentStream}</Markdown> : null}
            </Box>
          </Box>
        )}

        {/* Input Area */}
        {(appState === 'idle' || appState === 'success' || appState === 'error') && (
          <Box marginTop={1}>
            <Box marginRight={1}>
              <Text color={appState === 'success' ? 'green' : appState === 'error' ? 'red' : 'cyan'}>
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

        {/* Dev Inspector Panel */}
        {config.isDev && (
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">
              {showInspector ? '▼' : '▶'} [Dev Mode] Inspector (Press Ctrl+I to toggle)
            </Text>
            {showInspector && debugLogs.length > 0 && (
              <Box borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1} marginTop={1}>
                {debugLogs.map((log, i) => (
                  <Box key={i} flexDirection="column" marginBottom={1}>
                    <Text color="cyan" bold>
                      {log.event === 'request' ? '📤 API Request' : '📥 API Response'} (Loop {log.data.loop})
                    </Text>
                    <Text color="gray">{JSON.stringify(log.data, null, 2)}</Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </>
  );
};
