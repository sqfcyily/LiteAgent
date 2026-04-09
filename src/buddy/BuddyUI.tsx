import React, { useState, useEffect, useRef } from 'react';
import { render, Box, Text, Static, useInput, useApp } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import stripAnsi from 'strip-ansi';
import { getConfiguration, getModels, setActiveModel, ModelConfig } from '../config/index.js';
import { Markdown } from '../components/Markdown.js';
import { runEngine, EngineConfig } from '../services/agentEngine.js';
import type { EngineEvent, Message, ToolSchema } from '../utils/types.js';
import { getToolInstance } from '../tools/index.js';

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
type AgentState = 'idle' | 'thinking' | 'working' | 'success' | 'error' | 'select_mode' | 'add_mode_url' | 'add_mode_name' | 'add_mode_key';

type HistoryItem = 
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'tool'; toolName: string; args: string; result?: string; isError?: boolean };

const CommandSuggestions: React.FC<{ activeSuggestions: any[], suggestionIndex: number }> = ({ activeSuggestions, suggestionIndex }) => {
  const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns || 80);

  useEffect(() => {
    const handleResize = () => setTerminalWidth(process.stdout.columns || 80);
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  if (activeSuggestions.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
      {activeSuggestions.map((cmd, i) => {
        const maxCmdWidth = Math.max(...activeSuggestions.map(c => c.name.length));
        const prefixStr = i === suggestionIndex ? '❯ ' : '  ';
        const cmdStr = cmd.name.padEnd(maxCmdWidth, ' ');
        
        const prefixTotal = 2 + 2 + maxCmdWidth + 3;
        const maxDescWidth = Math.max(10, terminalWidth - prefixTotal - 2);

        let descStr = stripAnsi(cmd.description);
        if (descStr.length > maxDescWidth) {
          descStr = descStr.substring(0, maxDescWidth - 3) + '...';
        }

        return (
          <Box key={cmd.name} flexDirection="row">
            <Text color={i === suggestionIndex ? 'cyan' : 'gray'} bold={i === suggestionIndex}>
              {prefixStr}
            </Text>
            <Text color={i === suggestionIndex ? 'cyan' : 'gray'} bold={i === suggestionIndex}>
              {cmdStr}
            </Text>
            <Text color="gray" dimColor> - {descStr}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

const LiteAgentApp: React.FC<{ config: EngineConfig, tools: ToolSchema[], skillInstructions: string }> = ({ config, tools, skillInstructions }) => {
  const { exit } = useApp();

  // Model Management State
  const [currentConfig, setCurrentConfig] = useState<EngineConfig>(config);
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [newModel, setNewModel] = useState<{ baseUrl: string; name: string; apiKey: string }>({ baseUrl: '', name: '', apiKey: '' });

  const initialSystemPrompt = `You are LiteAgent, an independent, lightweight and precise AI assistant. 
IMPORTANT: You must STRICTLY identify yourself ONLY as "LiteAgent". NEVER mention "通义千问", "Qwen", "Alibaba", "OpenAI", "Anthropic", or any other company/model names.
You are equipped to handle ANY task the user requests—from software development to analysis and beyond. Always use tools when necessary to assist the user effectively. 
Current Working Directory: ${process.cwd()}
Language preference: ${currentConfig.language || 'zh-CN'}.\n\n${skillInstructions}`;
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: initialSystemPrompt }
  ]);
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState('');
  
  // Advanced State Tracking
  const [appState, setAppState] = useState<AgentState>('idle');
  const [currentStream, setCurrentStream] = useState('');
  const currentStreamRef = useRef(''); // Use ref to safely flush in async loop
  const [finishedResponse, setFinishedResponse] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<Array<{ id: string, name: string, args: string }>>([]);

  const skillTool = tools.find(t => t.function.name === 'Skill');
  const skillSuggestions = skillTool ? skillTool.function.description.split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => {
      const match = line.match(/^- ([^:]+):?(.*)$/);
      if (match) {
        const skillName = match[1].split(' ')[0]; // remove args part if any
        return { name: `/${skillName}`, description: `Skill: ${match[2].trim() || skillName}` };
      }
      return null;
    }).filter(Boolean) as Array<{ name: string, description: string }> : [];

  const COMMAND_SUGGESTIONS = [
    { name: '/mode', description: 'Switch or add AI models' },
    { name: '/dev', description: 'Toggle developer mode logs' }
  ];

  const activeSuggestions = input.startsWith('/') 
    ? COMMAND_SUGGESTIONS.filter(c => c.name.startsWith(input))
    : [];

  const [suggestionIndex, setSuggestionIndex] = useState(0);

  // Reset suggestion index when input changes
  useEffect(() => {
    setSuggestionIndex(0);
  }, [input]);

  useInput((ch, key) => {
    if (activeSuggestions.length > 0) {
      if (key.upArrow) {
        setSuggestionIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSuggestionIndex(prev => Math.min(activeSuggestions.length - 1, prev + 1));
      } else if (key.tab) {
        setInput(activeSuggestions[suggestionIndex].name + ' ');
      } else if (key.return) {
        // If it's an exact match without args, we might want to auto-execute
        // But the exact match logic is already in handleSubmit. We can let handleSubmit handle it.
      }
    }
  });

  // We keep debugLogs in state in case we want to show a counter or indicator, but we will write to file.
  const [debugLogs, setDebugLogs] = useState<any[]>([]);

  useEffect(() => {
    if (currentConfig.isDev) {
      const logPath = path.join(process.cwd(), 'lite-agent-dev.log');
      fs.writeFileSync(logPath, `=== LiteAgent Dev Session Started at ${new Date().toISOString()} ===\n`, 'utf-8');
    }
  }, [currentConfig.isDev]);

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
    return '●';
  };

  useEffect(() => {
    // No continuous animations needed
  }, []);

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Auto-complete on Enter if typing a partial slash command
    if (trimmed.startsWith('/') && activeSuggestions.length > 0) {
      const exactMatch = COMMAND_SUGGESTIONS.find(c => c.name === trimmed);
      if (!exactMatch) {
        // Auto-select and immediately execute if no args are needed for /mode or /dev
        const selectedCmd = activeSuggestions[suggestionIndex].name;
        if (selectedCmd === '/mode' || selectedCmd === '/dev' || selectedCmd === '/clear' || selectedCmd === '/exit') {
          setInput(''); // Clear input
          // Dispatch immediately
          if (selectedCmd === '/exit') {
            exit();
            return;
          }
          if (selectedCmd === '/clear') {
            setHistory([]);
            return;
          }
          if (selectedCmd === '/mode') {
            setAvailableModels(getModels());
            setAppState('select_mode');
            return;
          }
          if (selectedCmd === '/dev') {
            const newDevMode = !currentConfig.isDev;
            setCurrentConfig(prev => ({ ...prev, isDev: newDevMode }));
            setHistory(prev => [...prev, { role: 'assistant', content: newDevMode ? 'ℹ️ Dev mode logs are now written to `lite-agent-dev.log` in your current directory. Use `tail -f lite-agent-dev.log` in another terminal to monitor.' : 'ℹ️ Dev mode disabled.' }]);
            return;
          }
        }
        
        setInput(selectedCmd + ' ');
        return; // Wait for user to press Enter again if they didn't auto-execute
      }
    }

    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === '/exit') {
      exit();
      return;
    }
    if (trimmed.toLowerCase() === '/clear') {
      setHistory([]);
      setInput('');
      return;
    }
    if (trimmed.toLowerCase() === '/dev') {
      const newDevMode = !currentConfig.isDev;
      setCurrentConfig(prev => ({ ...prev, isDev: newDevMode }));
      setHistory(prev => [...prev, { role: 'assistant', content: newDevMode ? 'ℹ️ Dev mode logs are now written to `lite-agent-dev.log` in your current directory. Use `tail -f lite-agent-dev.log` in another terminal to monitor.' : 'ℹ️ Dev mode disabled.' }]);
      setInput('');
      return;
    }
    if (trimmed.toLowerCase() === '/mode') {
      setAvailableModels(getModels());
      setAppState('select_mode');
      setInput('');
      return;
    }

    let finalInputText = text;
    // Check if it's a skill shortcut
    if (trimmed.startsWith('/') && !['/exit', '/quit', '/clear', '/dev', '/mode'].includes(trimmed.toLowerCase().split(' ')[0])) {
      const parts = trimmed.split(' ');
      const skillName = parts[0].slice(1);
      const args = parts.slice(1).join(' ');
      finalInputText = `Execute the skill: ${skillName} ${args ? `with arguments: ${args}` : ''}`;
    }

    let currentHist = [...history];
    if (finishedResponse) {
      currentHist.push({ role: 'assistant', content: finishedResponse });
    }

    const userMsg = { role: 'user' as const, content: finalInputText };
    currentHist.push({ role: 'user' as const, content: text }); // keep original shortcut in UI
    setHistory(currentHist);

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    
    setInput('');
    setAppState('thinking');
    setCurrentStream('');
    setFinishedResponse(null);
    setDebugLogs([]); // Clear logs for new turn

    try {
      const stream = runEngine(newMessages, tools, currentConfig);

      for await (const event of stream) {
        switch (event.type) {
          case 'debug':
            if (currentConfig.isDev) {
              const logPath = path.join(process.cwd(), 'lite-agent-dev.log');
              const logEntry = `[${new Date().toISOString()}] ${event.event === 'request' ? '↑ API Request' : '↓ API Response'} (Loop ${event.data.loop})\n${JSON.stringify(event.data, null, 2)}\n\n`;
              fs.appendFileSync(logPath, logEntry, 'utf-8');
            }
            break;
          case 'thinking':
            setAppState('thinking');
            // We still track the stream for internal history/tool logic, but do not render it in the UI
            setCurrentStream(event.content);
            currentStreamRef.current = event.content;
            break;
          case 'tool_start':
            setAppState('working');
            // Add tool to activeTools list
            setActiveTools(prev => [...prev, { id: event.toolCallId || Date.now().toString(), name: event.toolName, args: event.args || '{}' }]);
            
            // 💡 Flush the "thought process" before the tool execution into history
            setHistory(prev => {
              const newHist = [...prev];
              // Only push if there's actual thinking content before the tool call
              if (currentStreamRef.current && currentStreamRef.current.trim()) {
                // Also ignore pushing if it is just "Reasoning loop X..."
                const content = currentStreamRef.current.trim();
                if (!content.startsWith('Reasoning loop ')) {
                  // Check if the last item is exactly the same to prevent duplicates
                  const lastItem = newHist[newHist.length - 1];
                  const formattedContent = `_Thought: ${content}_`;
                  if (!lastItem || lastItem.role !== 'assistant' || lastItem.content !== formattedContent) {
                    newHist.push({ role: 'assistant', content: formattedContent });
                  }
                }
              }
              return newHist;
            });
            // We clear the stream so the Markdown block disappears,
            // leaving only the "■ LiteAgent: Working..." header
            setCurrentStream('');
            currentStreamRef.current = '';
            break;
          case 'tool_end':
            setAppState('thinking');
            setActiveTools(prev => prev.filter(t => t.id !== event.toolCallId));
            // Push tool completion to history so it renders statically
            setHistory(prev => {
              const newHist = [...prev];
              newHist.push({ 
                role: 'tool', 
                toolName: event.toolName, 
                args: event.args || '{}', 
                result: event.result,
                isError: event.isError
              });
              return newHist;
            });
            break;
          case 'completed': {
            setMessages(event.finalMessages);
            const finalContent = event.content?.trim() || currentStreamRef.current?.trim();
            if (finalContent && !finalContent.startsWith('Reasoning loop ')) {
              // Check if the final content is identical to the last pushed thought in history
              setHistory(prev => {
                const newHist = [...prev];
                const lastItem = newHist[newHist.length - 1];
                const formattedThought = `_Thought: ${finalContent}_`;
                
                // If the last thing pushed to history was exactly this content (wrapped as a thought),
                // we drop the thought version and replace it with the final clean version.
                if (lastItem && lastItem.role === 'assistant' && lastItem.content === formattedThought) {
                  newHist.pop(); // Remove the thought version
                }
                return newHist;
              });
              
              // Usually the final content is the actual answer, so we don't wrap it in 'Thought:'
              if (finalContent.trim() !== '') {
                setFinishedResponse(finalContent);
              }
            }
            // Explicitly clear finishedResponse if the LLM returned absolutely nothing at the end of the loop
            // This prevents an empty "■ LiteAgent:" block from hanging in the UI
            if (!finalContent || finalContent.trim() === '') {
              setFinishedResponse(null);
            }

            setCurrentStream('');
            currentStreamRef.current = '';
            
            // Go straight to idle to instantly remove the "Thinking..." block from the screen.
            setAppState('idle');
            break;
          }
          case 'error':
            const errorMsg = { role: 'assistant' as const, content: `❌ Error: ${event.error.message}` };
            setMessages([...newMessages, errorMsg]);
            setHistory(prev => {
              const newHist = [...prev];
              newHist.push(errorMsg);
              return newHist;
            });
            setCurrentStream('');
            setFinishedResponse(null);
            setActiveTools([]); // Clear any stuck active tools
            
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
        newHist.push(fatalErrorMsg);
        return newHist;
      });
      setCurrentStream('');
      setFinishedResponse(null);
      setActiveTools([]); // Clear any stuck active tools
      
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
                  mt = 0; // Compress consecutive assistant blocks
                } else if (msg.role === 'tool') {
                  mt = 0; // Tool call directly under the thinking block
                }
              }
            }

            return (
              <Box key={index} flexDirection="column" marginTop={mt} marginBottom={0}>
                {msg.role === 'user' && (
                  <>
                    <Box marginBottom={0}><Text bold color="green">◆ You</Text></Box>
                    <Box paddingLeft={2}><Markdown>{msg.content}</Markdown></Box>
                  </>
                )}
                
                {msg.role === 'assistant' && (
                  <>
                    {showHeader && <Box marginBottom={0}><Text bold color="cyan">■ LiteAgent: </Text></Box>}
                    <Box paddingLeft={2} marginBottom={0}><Markdown>{msg.content}</Markdown></Box>
                  </>
                )}

                {msg.role === 'tool' && (() => {
                  const toolInstance = getToolInstance(msg.toolName);
                  let parsedArgs = {};
                  try { parsedArgs = JSON.parse(msg.args || '{}'); } catch(e) {}
                  
                  if (toolInstance) {
                    if (msg.isError) {
                      return toolInstance.renderToolUseErrorMessage(parsedArgs, msg.result || 'Unknown error');
                    } else {
                      return toolInstance.renderToolResultMessage(parsedArgs, msg.result || '');
                    }
                  } else {
                    // Fallback rendering
                    return (
                      <Box paddingLeft={2} flexDirection="column">
                        <Box flexDirection="row">
                          <Text color={msg.isError ? "red" : "green"}>{msg.isError ? "✖" : "✓"} Tool {msg.isError ? "Error" : "Completed"}: </Text>
                          <Text color={msg.isError ? "red" : "green"} bold>{msg.toolName}</Text>
                        </Box>
                        {msg.result && (
                          <Box paddingLeft={2}>
                            <Text color="gray" dimColor>{msg.result.substring(0, 200)}{msg.result.length > 200 ? '...' : ''}</Text>
                          </Box>
                        )}
                      </Box>
                    );
                  }
                })()}
              </Box>
            );
          }}
        </Static>

      <Box flexDirection="column">
        {/* Active Processing Area */}
        {(appState === 'thinking' || appState === 'working') && (
          <Box flexDirection="column" marginTop={1} paddingLeft={0} marginBottom={1}>
            <Box flexDirection="row">
              <Text bold color="cyan">■ LiteAgent: </Text>
              <Text color="yellow" italic>
                {appState === 'thinking' ? 'Thinking... ' : 'Working... '}
              </Text>
            </Box>
            
            {/* Render active tools in the dynamic area */}
            {activeTools.length > 0 && (
              <Box flexDirection="column" marginTop={0}>
                {activeTools.map(active => {
                  const toolInstance = getToolInstance(active.name);
                  let parsedArgs = {};
                  try { parsedArgs = JSON.parse(active.args); } catch(e) {}
                  
                  return (
                    <Box key={active.id}>
                      {toolInstance 
                        ? toolInstance.renderToolUseMessage(parsedArgs) 
                        : <Box paddingLeft={2} flexDirection="row">
                            <Text color="yellow">⚙️  Calling Tool: </Text>
                            <Text color="yellow" bold>{active.name}</Text>
                          </Box>
                      }
                    </Box>
                  );
                })}
              </Box>
            )}

            {currentStream.trim() ? (
              <Box marginTop={0} paddingLeft={2}>
                <Text color="gray" dimColor italic>
                  {currentStream}
                </Text>
              </Box>
            ) : null}
          </Box>
        )}

        {/* Finished Response Area (Waiting to be pushed to Static on next input) */}
        {appState === 'idle' && finishedResponse && (
          <Box flexDirection="column" marginTop={1} marginBottom={0}>
            <Box marginBottom={0}><Text bold color="cyan">■ LiteAgent: </Text></Box>
            <Box paddingLeft={2}><Markdown>{finishedResponse}</Markdown></Box>
          </Box>
        )}

        {/* Model Selection UI */}
        {appState === 'select_mode' && (
          <Box flexDirection="column" borderTop={true} borderStyle="single" borderColor="cyan" paddingX={1} paddingTop={0} paddingBottom={0}>
            <Box marginBottom={1}><Text color="cyan" bold>Please select a model or add a new one:</Text></Box>
            <SelectInput 
              items={[
                ...availableModels.map((m, i) => ({ label: `${m.name} (${m.baseUrl})`, value: i.toString() })),
                { label: '+ Add new model...', value: 'add_new' },
                { label: 'Cancel', value: 'cancel' }
              ]} 
              onSelect={(item) => {
                setTimeout(() => {
                  if (item.value === 'cancel') {
                    setAppState('idle');
                  } else if (item.value === 'add_new') {
                    setAppState('add_mode_url');
                    setNewModel({ baseUrl: '', name: '', apiKey: '' });
                  } else {
                    const idx = parseInt(item.value, 10);
                    const selected = availableModels[idx];
                    setActiveModel(selected);
                    setCurrentConfig(getConfiguration());
                    setHistory(prev => [...prev, { role: 'assistant', content: `✅ Model switched to **${selected.name}**` }]);
                    setAppState('idle');
                  }
                }, 0);
              }} 
            />
          </Box>
        )}

        {/* Add Model UI */}
        {appState === 'add_mode_url' && (
          <Box flexDirection="column" borderTop={true} borderStyle="single" borderColor="cyan" paddingX={1} paddingTop={0} paddingBottom={0}>
            <Box marginBottom={0}><Text color="cyan" bold>Enter BASE_URL (e.g. https://api.openai.com/v1):</Text></Box>
            <Box>
              <Text color="yellow" bold>❯ </Text>
              {/* @ts-ignore */}
              <TextInput key="input-add-url" focus={appState === 'add_mode_url'} value={newModel.baseUrl} onChange={(v) => setNewModel(p => ({ ...p, baseUrl: v }))} onSubmit={(v) => { if(v.trim()) setTimeout(() => setAppState('add_mode_name'), 0); else setTimeout(() => setAppState('idle'), 0); }} />
            </Box>
          </Box>
        )}

        {appState === 'add_mode_name' && (
          <Box flexDirection="column" borderTop={true} borderStyle="single" borderColor="cyan" paddingX={1} paddingTop={0} paddingBottom={0}>
            <Box marginBottom={0}><Text color="cyan" bold>Enter MODEL_NAME (e.g. gpt-4o):</Text></Box>
            <Box>
              <Text color="yellow" bold>❯ </Text>
              {/* @ts-ignore */}
              <TextInput key="input-add-name" focus={appState === 'add_mode_name'} value={newModel.name} onChange={(v) => setNewModel(p => ({ ...p, name: v }))} onSubmit={(v) => { if(v.trim()) setTimeout(() => setAppState('add_mode_key'), 0); else setTimeout(() => setAppState('idle'), 0); }} />
            </Box>
          </Box>
        )}

        {appState === 'add_mode_key' && (
          <Box flexDirection="column" borderTop={true} borderStyle="single" borderColor="cyan" paddingX={1} paddingTop={0} paddingBottom={0}>
            <Box marginBottom={0}><Text color="cyan" bold>Enter API_KEY:</Text></Box>
            <Box>
              <Text color="yellow" bold>❯ </Text>
              {/* @ts-ignore */}
              <TextInput key="input-add-key" focus={appState === 'add_mode_key'} mask="*" value={newModel.apiKey} onChange={(v) => setNewModel(p => ({ ...p, apiKey: v }))} onSubmit={(v) => { 
                setTimeout(() => {
                  if(v.trim()) {
                    const m = { ...newModel, apiKey: v.trim() };
                    setActiveModel(m);
                    setCurrentConfig(getConfiguration());
                    setHistory(prev => [...prev, { role: 'assistant', content: `✅ New model added and switched to **${m.name}**` }]);
                    setAppState('idle');
                  } else {
                    setAppState('idle');
                  }
                }, 0);
              }} />
            </Box>
          </Box>
        )}

        {/* Input Area (Always rendered at the bottom) */}
        {(appState === 'idle' || appState === 'success' || appState === 'error') && (
          <Box flexDirection="column" borderTop={true} borderStyle="single" borderColor="gray" paddingX={1} paddingTop={0} paddingBottom={0}>
            
            {/* Slash Command Suggestions */}
            <CommandSuggestions activeSuggestions={activeSuggestions} suggestionIndex={suggestionIndex} />

            {/* Status Bar */}
            <Box marginBottom={0} justifyContent="space-between">
              <Box>
                <Text color="green" bold>LiteAgent</Text>
                <Text color="gray"> │ {currentConfig.model} │ {process.cwd()}</Text>
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
                  key={`input-${appState}`}
                  focus={appState === 'idle' || appState === 'success' || appState === 'error'}
                  value={input} 
                  onChange={setInput} 
                  onSubmit={handleSubmit} 
                  placeholder={currentConfig.isDev ? "Type a message... (Logs are in lite-agent-dev.log)" : "Type a message..."} 
                />
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
};
