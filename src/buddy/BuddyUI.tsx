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
  | { role: 'tool'; toolName: string; args: string };

const LiteAgentApp: React.FC<{ config: EngineConfig, tools: ToolSchema[], skillInstructions: string }> = ({ config, tools, skillInstructions }) => {
  const { exit } = useApp();

  const initialSystemPrompt = `You are LiteAgent, an independent, lightweight and precise AI assistant. 
IMPORTANT: You must STRICTLY identify yourself ONLY as "LiteAgent". NEVER mention "通义千问", "Qwen", "Alibaba", "OpenAI", "Anthropic", or any other company/model names.
You are equipped to handle ANY task the user requests—from software development to analysis and beyond. Always use tools when necessary to assist the user effectively. 
Current Working Directory: ${process.cwd()}
Language preference: ${config.language || 'zh-CN'}.\n\n${skillInstructions}`;
  
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
  const [finishedResponse, setFinishedResponse] = useState<string | null>(null);
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

    let currentHist = [...history];
    if (finishedResponse) {
      currentHist.push({ role: 'assistant', content: finishedResponse });
    }

    const userMsg = { role: 'user' as const, content: text };
    currentHist.push(userMsg);
    setHistory(currentHist);

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    
    setInput('');
    setAppState('thinking');
    setStatusText('Thinking...');
    setCurrentStream('');
    setFinishedResponse(null);
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
            // We no longer use statusText for the active processing area title, 
            // but we update it just in case it's used elsewhere
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
            // We clear the stream so the Markdown block disappears,
            // leaving only the "■ LiteAgent: Working..." header
            setCurrentStream('');
            currentStreamRef.current = '';
            break;
          case 'tool_end':
            setAppState('thinking');
            setStatusText(`Tool [${event.toolName}] finished.`);
            break;
          case 'completed':
            setMessages(event.finalMessages);
            const finalContent = event.content?.trim() || currentStreamRef.current?.trim();
            if (finalContent) {
              setFinishedResponse(finalContent);
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
            setHistory(prev => {
              const newHist = [...prev];
              if (finishedResponse) newHist.push({ role: 'assistant', content: finishedResponse });
              newHist.push(errorMsg);
              return newHist;
            });
            setCurrentStream('');
            setFinishedResponse(null);
            
            setAppState('error');
            setTimeout(() => setAppState('idle'), 3000);
            break;
        }
      }
    } catch (e: any) {
      const fatalErrorMsg = { role: 'assistant' as const, content: `❌ Fatal Error: ${e.message}` };
      setMessages([...newMessages, fatalErrorMsg]);
      setHistory(prev => {
        const newHist = [...prev];
        if (finishedResponse) newHist.push({ role: 'assistant', content: finishedResponse });
        newHist.push(fatalErrorMsg);
        return newHist;
      });
      setCurrentStream('');
      setFinishedResponse(null);
      
      setAppState('error');
      setTimeout(() => setAppState('idle'), 3000);
    }
  };

  return (
    <>
      {/* 📜 Scrollable History via Static */}
      <Static items={history}>
          {(msg, index) => {
            let mt = 0;
            let showHeader = true;

            if (index > 0) {
              const prevRole = history[index - 1].role;
              // Treat both 'assistant' and 'tool' as the AI's turn
              const isPrevAI = prevRole === 'assistant' || prevRole === 'tool';
              const isCurrAI = msg.role === 'assistant' || msg.role === 'tool';
              const isPrevUser = prevRole === 'user';
              const isCurrUser = msg.role === 'user';

              if (isPrevUser !== isCurrUser) {
                mt = 1; // 1 blank line between turns (which is mt=2 in CSS terms, but ink Box handles it differently)
              }

              // Handle spacing within AI's turn
              if (isPrevAI && isCurrAI) {
                showHeader = false;
                
                // Add a blank line before a new thinking block (assistant), 
                // but keep tool calls tightly coupled to their thinking block.
                if (msg.role === 'assistant' && prevRole === 'tool') {
                  mt = 1; 
                } else if (msg.role === 'assistant' && prevRole === 'assistant') {
                  mt = 1;
                } else if (msg.role === 'tool') {
                  mt = 0; // Tool call directly under the thinking block
                }
              }
            }

            return (
              <Box key={index} flexDirection="column" marginTop={mt} marginBottom={0}>
                {msg.role === 'user' && (
                  <>
                    <Box marginBottom={1}><Text bold color="green">◆ You</Text></Box>
                    <Box paddingLeft={2}><Markdown>{msg.content}</Markdown></Box>
                  </>
                )}
                
                {msg.role === 'assistant' && (
                  <>
                    {showHeader && <Box marginBottom={0}><Text bold color="cyan">■ LiteAgent: </Text></Box>}
                    <Box paddingLeft={4} marginBottom={0}><Markdown>{msg.content}</Markdown></Box>
                  </>
                )}

                {msg.role === 'tool' && (
                  <>
                    <Box paddingLeft={4} flexDirection="row">
                      <Text color="yellow">⚙️  Calling Tool: </Text>
                      <Text color="yellow" bold>{msg.toolName}</Text>
                    </Box>
                  </>
                )}
              </Box>
            );
          }}
        </Static>

      <Box flexDirection="column">
        {/* Active Processing Area */}
        {(appState === 'thinking' || appState === 'working') && (
          <Box flexDirection="column" marginTop={1} paddingLeft={2} marginBottom={1}>
            <Box flexDirection="row">
              <Text bold color="cyan">■ LiteAgent: </Text>
              <Text color="yellow" italic>
                {appState === 'thinking' ? 'Thinking... ' : 'Working... '}
              </Text>
            </Box>
            {currentStream.trim() ? (
              <Box marginTop={0} paddingLeft={2}>
                <Markdown>{currentStream}</Markdown>
              </Box>
            ) : null}
          </Box>
        )}

        {/* Finished Response Area (Waiting to be pushed to Static on next input) */}
        {appState === 'idle' && finishedResponse && (
          <Box flexDirection="column" marginTop={1} marginBottom={0}>
            <Box marginBottom={0}><Text bold color="cyan">■ LiteAgent: </Text></Box>
            <Box paddingLeft={4}><Markdown>{finishedResponse}</Markdown></Box>
          </Box>
        )}

        {/* Input Area (Always rendered at the bottom) */}
        {(appState === 'idle' || appState === 'success' || appState === 'error') && (
          <Box flexDirection="column" borderTop={true} borderStyle="single" borderColor="gray" paddingX={1} paddingTop={0} paddingBottom={0}>
            {/* Status Bar */}
            <Box marginBottom={0} justifyContent="space-between">
              <Box>
                <Text color="green" bold>LiteAgent</Text>
                <Text color="gray"> │ {config.model} │ {process.cwd()}</Text>
              </Box>
              <Box>
                <Text color="gray">Press Ctrl+C to exit</Text>
              </Box>
            </Box>

            {/* Input Field */}
            <Box>
              <Box marginRight={1}>
                <Text color={appState === 'error' ? 'red' : 'green'} bold>❯</Text>
              </Box>
              <Box flexGrow={1}>
                {/* @ts-ignore */}
                <TextInput 
                  value={input} 
                  onChange={setInput} 
                  onSubmit={handleSubmit} 
                  placeholder={config.isDev ? "Type a message... (Logs are in dev.log, type /dev for info)" : "Type a message..."} 
                />
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
};
