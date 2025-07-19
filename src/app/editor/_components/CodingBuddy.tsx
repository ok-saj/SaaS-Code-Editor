"use client";

import { Button } from '@/components/ui/button';
import { Brain, X, Send, Code, Copy, Check, Loader2, MessageSquare, Sparkles, Plus } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useCodeEditorStore } from '@/store/useCodeEditorStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

// Interface for chat messages
interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  codeBlocks?: CodeBlock[];
}

// Interface for code blocks within messages
interface CodeBlock {
  language: string;
  code: string;
  id: string;
}

function CodingBuddy() {
  // State management for dialog and chat functionality
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  
  // Refs for auto-scrolling and input focus
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Get current language and editor from store
  const { language, editor } = useCodeEditorStore();

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Initialize chat with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: '1',
        content: `Hello! I'm your AI coding assistant. I can help you with:\n\n• Code explanations and debugging\n• Algorithm implementations\n• Best practices and optimization\n• Language-specific questions\n• Code reviews and suggestions\n\nCurrently, you're working with **${language.toUpperCase()}**. How can I assist you today?`,
        isUser: false,
        timestamp: new Date(),
      }]);
    }
  }, [language]);

  // Extract code blocks from AI response using regex
  const extractCodeBlocks = (text: string): { cleanText: string; codeBlocks: CodeBlock[] } => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks: CodeBlock[] = [];
    let match;
    let cleanText = text;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const [fullMatch, lang, code] = match;
      const blockId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      codeBlocks.push({
        language: lang || language,
        code: code.trim(),
        id: blockId,
      });

      // Replace code block with placeholder in clean text
      cleanText = cleanText.replace(fullMatch, `\n\n[CODE_BLOCK_${blockId}]\n\n`);
    }

    return { cleanText, codeBlocks };
  };

  // Handle sending messages to AI
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      isUser: true,
      timestamp: new Date(),
    };

    // Add user message and clear input
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Configure Gemini model for coding assistance
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-001",
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      });

      // Create context-aware prompt
      const prompt = `You are an expert coding assistant. The user is currently working with ${language.toUpperCase()}.

User question: ${inputMessage}

Please provide a helpful, accurate response. If you include code examples:
1. Use proper syntax highlighting with \`\`\`${language} for ${language} code
2. Provide clear explanations
3. Include comments in the code when helpful
4. Keep code examples concise but complete

Focus on being practical and educational.`;

      // Get AI response
      const result = await model.generateContent(prompt);
      const aiResponse = result.response.text();

      // Extract code blocks from response
      const { cleanText, codeBlocks } = extractCodeBlocks(aiResponse);

      // Create AI message
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: cleanText,
        isUser: false,
        timestamp: new Date(),
        codeBlocks,
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error getting AI response:', error);
      toast.error('Failed to get AI response. Please try again.');
      
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error. Please try asking your question again.',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Enter key press in textarea
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Copy code to clipboard
  const handleCopyCode = async (code: string, codeId: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(codeId);
      toast.success('Code copied to clipboard!');
      setTimeout(() => setCopiedCodeId(null), 2000);
    } catch (error) {
      toast.error('Failed to copy code');
    }
  };

  // Insert code directly into the editor
  const handleInsertCode = (code: string) => {
    if (editor) {
      const position = editor.getPosition();
      editor.executeEdits('coding-buddy', [{
        range: {
          startLineNumber: position?.lineNumber || 1,
          startColumn: position?.column || 1,
          endLineNumber: position?.lineNumber || 1,
          endColumn: position?.column || 1,
        },
        text: code,
      }]);
      editor.focus();
      toast.success('Code inserted into editor!');
      setIsOpen(false); // Close dialog after insertion
    } else {
      toast.error('Editor not available');
    }
  };

  // Clear chat history
  const handleClearChat = () => {
    setMessages([{
      id: '1',
      content: `Hello! I'm your AI coding assistant. I can help you with:\n\n• Code explanations and debugging\n• Algorithm implementations\n• Best practices and optimization\n• Language-specific questions\n• Code reviews and suggestions\n\nCurrently, you're working with **${language.toUpperCase()}**. How can I assist you today?`,
      isUser: false,
      timestamp: new Date(),
    }]);
  };

  // Render message content with code block placeholders replaced
  const renderMessageContent = (message: Message) => {
    let content = message.content;
    
    // Replace code block placeholders with actual code blocks
    message.codeBlocks?.forEach(block => {
      content = content.replace(`[CODE_BLOCK_${block.id}]`, '');
    });

    return (
      <div className="space-y-4">
        {/* Render text content */}
        {content.trim() && (
          <div className="prose prose-invert max-w-none">
            {content.split('\n').map((line, index) => {
              if (line.startsWith('•')) {
                return <li key={index} className="text-gray-300 ml-4">{line.substring(1).trim()}</li>;
              }
              if (line.startsWith('**') && line.endsWith('**')) {
                return <strong key={index} className="text-blue-400">{line.slice(2, -2)}</strong>;
              }
              return line.trim() ? <p key={index} className="text-gray-300 mb-2">{line}</p> : <br key={index} />;
            })}
          </div>
        )}
        
        {/* Render code blocks */}
        {message.codeBlocks?.map(block => (
          <div key={block.id} className="relative group">
            <div className="bg-[#0d1117] rounded-lg border border-gray-800/50 overflow-hidden">
              {/* Code block header */}
              <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50 border-b border-gray-800/50">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-gray-400">{block.language}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Copy button */}
                  <button
                    onClick={() => handleCopyCode(block.code, block.id)}
                    className="p-1.5 hover:bg-gray-800 rounded transition-colors"
                    title="Copy code"
                  >
                    {copiedCodeId === block.id ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  
                  {/* Insert into editor button */}
                  <button
                    onClick={() => handleInsertCode(block.code)}
                    className="flex items-center gap-1 px-2 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded text-xs transition-colors"
                    title="Insert into editor"
                  >
                    <Plus className="w-3 h-3" />
                    Insert
                  </button>
                </div>
              </div>
              
              {/* Code content */}
              <SyntaxHighlighter
                language={block.language.toLowerCase()}
                style={oneDark}
                customStyle={{
                  margin: 0,
                  padding: '1rem',
                  background: 'transparent',
                  fontSize: '14px',
                }}
                showLineNumbers={true}
              >
                {block.code}
              </SyntaxHighlighter>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Trigger Button */}
      <Button
        className="animated-border-button"
        onClick={() => setIsOpen(true)}
      >
        <style>{`
          @property --angle {
            syntax: "<angle>";
            initial-value: 0deg;
            inherits: false;
          }

          @keyframes fadeInUp {
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes spin {
            from { --angle: 0deg; }
            to   { --angle: 360deg; }
          }

          .animated-border-button {
            position: relative;
            padding: 3px;
            border-radius: 1rem;
            opacity: 0;
            animation: fadeInUp 0.6s ease-out forwards;
            isolation: isolate;
          }

          .animated-border-button:hover::before,
          .animated-border-button:hover::after {
            content: "";
            position: absolute;
            inset: 0;
            padding: 3px;
            border-radius: 1rem;
            background-image: conic-gradient(from var(--angle), #ff4545, #00ff99, #006aff, #ff0095, #ff4545);
            animation: spin 2.5s linear infinite;
            z-index: -1;
          }

          .animated-border-button:hover::before {
            filter: blur(1.5rem);
            opacity: 0.5;
          }

          .button-content {
            position: relative;
            z-index: 1;
            background: #000; 
            border-color: #555879;
            height: 100%;
            padding: 1rem 1rem;
            display: flex;
            border-radius: 1rem;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
          }
        `}</style>
        <div className="button-content">
          <Brain className="w-5 h-5 text-sky-400" />
          <span className="text-white font-medium">Coding Buddy</span>
        </div>
      </Button>

      {/* AI Chat Dialog */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1e1e2e] rounded-2xl border border-gray-800/50 w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Dialog Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-800/50 bg-gradient-to-r from-blue-500/5 to-purple-500/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl">
                    <Brain className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">AI Coding Assistant</h2>
                    <p className="text-sm text-gray-400">
                      Currently working with <span className="text-blue-400 font-medium">{language.toUpperCase()}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Clear chat button */}
                  <button
                    onClick={handleClearChat}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-300"
                    title="Clear chat"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                  
                  {/* Close button */}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-4 ${
                        message.isUser
                          ? 'bg-blue-500/10 border border-blue-500/20 text-blue-100'
                          : 'bg-gray-800/50 border border-gray-700/50 text-gray-100'
                      }`}
                    >
                      {message.isUser ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      ) : (
                        renderMessageContent(message)
                      )}
                      <div className="mt-2 text-xs text-gray-500">
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-6 border-t border-gray-800/50 bg-gray-900/20">
                <div className="flex items-end gap-3">
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={`Ask me anything about ${language} or coding in general...`}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                      rows={3}
                      disabled={isLoading}
                    />
                    <div className="absolute bottom-2 right-2 text-xs text-gray-500">
                      Press Enter to send, Shift+Enter for new line
                    </div>
                  </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || isLoading}
                    className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl transition-colors"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <Send className="w-5 h-5 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default CodingBuddy;