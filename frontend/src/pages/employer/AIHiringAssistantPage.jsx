import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { employerService } from '../../services/employer.service.js';
import {
  Bot, Send, Plus, MessageSquare, Sparkles, Search,
  Loader2, ArrowLeft, Clock, ChevronRight, Zap, Users,
  BriefcaseBusiness, GraduationCap, X, Trash2, PanelLeftClose, PanelLeftOpen, Edit, Menu
} from 'lucide-react';

/* ── Suggested prompts shown for new conversations ────────── */
const SUGGESTED_PROMPTS = [
  { icon: Users, text: 'Find me candidates for React internship', color: 'text-blue-600 bg-blue-50 ring-blue-200' },
  { icon: BriefcaseBusiness, text: 'Who are the top full-stack developers?', color: 'text-brand-600 bg-brand-50 ring-brand-200' },
  { icon: Zap, text: 'Show me students with deployed projects', color: 'text-amber-600 bg-amber-50 ring-amber-200' },
  { icon: GraduationCap, text: 'Find candidates graduating in 2026', color: 'text-emerald-600 bg-emerald-50 ring-emerald-200' },
];

/* ── Simple markdown renderer (bold, bullets, headers) ────── */
function renderMarkdown(text) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let listBuffer = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-1 pl-4 my-2">
          {listBuffer.map((item, i) => (
            <li key={i} className="list-disc text-brand-700 text-sm leading-relaxed">
              {formatInline(item)}
            </li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  function formatInline(str) {
    // Bold **text**
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-brand-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(<h4 key={i} className="text-sm font-bold text-brand-900 mt-3 mb-1">{formatInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={i} className="text-base font-bold text-brand-900 mt-3 mb-1">{formatInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={i} className="text-lg font-bold text-brand-900 mt-3 mb-1">{formatInline(trimmed.slice(2))}</h2>);
    }
    // Numbered lists
    else if (/^\d+\.\s/.test(trimmed)) {
      flushList();
      const content = trimmed.replace(/^\d+\.\s/, '');
      elements.push(
        <div key={i} className="flex gap-2 my-1">
          <span className="text-brand-600 font-bold text-sm flex-shrink-0">{trimmed.match(/^\d+/)[0]}.</span>
          <span className="text-sm text-brand-700 leading-relaxed">{formatInline(content)}</span>
        </div>
      );
    }
    // Bullet points
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listBuffer.push(trimmed.slice(2));
    }
    // Empty lines
    else if (trimmed === '') {
      flushList();
    }
    // Regular text
    else {
      flushList();
      elements.push(<p key={i} className="text-sm text-brand-700 leading-relaxed my-1">{formatInline(trimmed)}</p>);
    }
  }

  flushList();
  return elements;
}

/* ── Typing indicator (3-dot pulse) ──────────────────────── */
function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center flex-shrink-0 shadow-md">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="chat-bubble-ai flex items-center gap-1.5 py-4">
        <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

/* ── Thread sidebar ──────────────────────────────────────── */
function ThreadSidebar({ threads, activeThreadId, onSelectThread, onNewThread, onDeleteThread, isLoading }) {
  const [search, setSearch] = useState('');

  const filtered = (threads || []).filter(t =>
    !search || t.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-brand-100">
        <button
          id="new-conversation-btn"
          onClick={onNewThread}
          className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          New Conversation
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-400" />
          <input
            type="text"
            placeholder="Search threads..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9 py-2 text-xs"
            id="thread-search-input"
          />
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {[1,2,3].map(i => <div key={i} className="h-14 skeleton rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare className="h-8 w-8 text-brand-200 mx-auto mb-2" />
            <p className="text-xs text-brand-400">
              {search ? 'No matching threads' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          filtered.map(thread => (
            <div key={thread.threadId} className="relative group/item">
              <button
                onClick={() => onSelectThread(thread.threadId)}
                className={`w-full text-left p-3 rounded-lg transition-all duration-150 group ${
                  activeThreadId === thread.threadId
                    ? 'bg-brand-50 ring-1 ring-brand-200'
                    : 'hover:bg-brand-50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    activeThreadId === thread.threadId
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-brand-100 text-brand-500 group-hover:bg-brand-200'
                  }`}>
                    <MessageSquare className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <p className={`text-sm font-medium truncate ${
                      activeThreadId === thread.threadId ? 'text-brand-800' : 'text-brand-700'
                    }`}>
                      {thread.title || 'Untitled'}
                    </p>
                    <p className="text-xs text-brand-400 truncate mt-0.5">
                      {thread.lastMessagePreview || ''}
                    </p>
                  </div>
                </div>
                {thread.lastMessageAt && (
                  <div className="flex items-center gap-1 mt-1.5 pl-9">
                    <Clock className="h-3 w-3 text-brand-300" />
                    <span className="text-[10px] text-brand-400">
                      {new Date(thread.lastMessageAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
              </button>
              
              {/* Delete button (visible on hover) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Are you sure you want to delete this conversation?')) {
                    onDeleteThread(thread.threadId);
                  }
                }}
                className="absolute right-2 top-3 h-7 w-7 rounded-lg flex items-center justify-center text-brand-400 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover/item:opacity-100 transition-all duration-150"
                title="Delete thread"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Main page component ─────────────────────────────────── */
export default function AIHiringAssistantPage() {
  const queryClient = useQueryClient();
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch threads
  const { data: threads, isLoading: threadsLoading } = useQuery({
    queryKey: ['employer', 'ai-threads'],
    queryFn: employerService.aiListThreads,
  });

  // Fetch messages when a thread is selected
  const { data: threadMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ['employer', 'ai-messages', activeThreadId],
    queryFn: () => employerService.aiGetMessages(activeThreadId),
    enabled: !!activeThreadId,
  });

  // Sync fetched messages into local state
  useEffect(() => {
    if (threadMessages) {
      setMessages(threadMessages);
    }
  }, [threadMessages]);

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: (body) => employerService.aiChat(body),
    onSuccess: (data) => {
      // Add AI reply to messages
      setMessages(prev => [...prev, {
        messageId: Date.now().toString(),
        role: 'assistant',
        content: typeof data.reply === 'string' ? data.reply : (data.reply?.content || data.reply?.text || ''),
        createdAt: new Date().toISOString(),
      }]);

      // Update thread ID if this was a new conversation
      if (!activeThreadId && data.threadId) {
        setActiveThreadId(data.threadId);
      }

      // Refetch thread list to update previews
      queryClient.invalidateQueries({ queryKey: ['employer', 'ai-threads'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => employerService.aiDeleteThread(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['employer', 'ai-threads'] });
      if (activeThreadId === deletedId) {
        handleNewThread();
      }
    },
  });

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, chatMutation.isPending, scrollToBottom]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeThreadId]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || chatMutation.isPending) return;

    // Optimistically add user message
    setMessages(prev => [...prev, {
      messageId: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }]);

    setInputValue('');

    chatMutation.mutate({
      threadId: activeThreadId,
      message: text,
    });
  }, [inputValue, activeThreadId, chatMutation]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedPrompt = (text) => {
    setInputValue(text);
    // Auto-send
    setMessages(prev => [...prev, {
      messageId: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }]);
    chatMutation.mutate({ threadId: activeThreadId, message: text });
  };

  const handleNewThread = () => {
    setActiveThreadId(null);
    setMessages([]);
    setSidebarOpen(false);
    if (!desktopSidebarOpen) setDesktopSidebarOpen(true);
    inputRef.current?.focus();
  };

  const handleSelectThread = (threadId) => {
    setActiveThreadId(threadId);
    setSidebarOpen(false);
  };

  const isNewConversation = messages.length === 0 && !activeThreadId;

  return (
    <div className="-mx-4 sm:-mx-6 -my-6" id="ai-hiring-assistant-page">
      <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden animate-fade-in">
      {/* ── Mobile sidebar overlay ───────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-white shadow-2xl animate-slide-right">
            <div className="flex items-center justify-between p-4 border-b border-brand-100">
              <h3 className="font-semibold text-brand-900">Conversations</h3>
              <button onClick={() => setSidebarOpen(false)} className="btn-ghost p-1.5 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ThreadSidebar
              threads={threads}
              activeThreadId={activeThreadId}
              onSelectThread={handleSelectThread}
              onNewThread={handleNewThread}
              isLoading={threadsLoading}
            />
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ──────────────────────────────── */}
      <div 
        className={`hidden lg:flex flex-shrink-0 bg-white border-brand-100 transition-all duration-300 ease-in-out overflow-hidden ${
          desktopSidebarOpen ? 'w-72 xl:w-80 border-r opacity-100' : 'w-0 border-r-0 opacity-0'
        }`}
      >
        <div className="w-72 xl:w-80 h-full flex-shrink-0">
          <ThreadSidebar
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectThread={handleSelectThread}
            onNewThread={handleNewThread}
            onDeleteThread={(id) => deleteMutation.mutate(id)}
            isLoading={threadsLoading}
          />
        </div>
      </div>

      {/* ── Main chat area ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-brand-50">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur-md border-b border-brand-100 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden btn-ghost p-1.5 rounded-lg"
            id="mobile-sidebar-toggle"
          >
            <Menu className="h-4.5 w-4.5" style={{ width: '18px', height: '18px' }} />
          </button>
          
          <button
            onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)}
            className="hidden lg:flex btn-ghost p-1.5 rounded-lg"
            title={desktopSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {desktopSidebarOpen ? (
              <PanelLeftClose className="h-5 w-5 text-brand-500" />
            ) : (
              <PanelLeftOpen className="h-5 w-5 text-brand-500" />
            )}
          </button>

          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-soft-md shadow-brand-500/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-brand-900">AI Hiring Assistant</h1>
            <p className="text-xs text-brand-400">Powered by AI · Ask about candidates, skills, and matches</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleNewThread}
              className="hidden sm:flex btn-ghost p-1.5 rounded-lg text-brand-500 hover:text-brand-600"
              title="New Conversation"
            >
              <Edit className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-full border border-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-medium text-emerald-700 uppercase tracking-wider">Online</span>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6" id="chat-messages-container">
          {messagesLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 text-brand-500 animate-spin" />
            </div>
          ) : isNewConversation ? (
            /* ── Empty state / Welcome ────────────────────── */
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center px-4">
              {/* Glowing AI avatar */}
              <div className="relative mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 blur-xl opacity-30 animate-pulse" />
                <div className="relative h-20 w-20 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-xl shadow-brand-500/25">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
              </div>

              <h2 className="text-xl font-bold text-brand-900 mb-2">AI Hiring Assistant</h2>
              <p className="text-sm text-brand-500 mb-8 leading-relaxed">
                I can help you find the perfect candidates from our student pool. Ask me to search by skills,
                compare candidates, or explain why someone is a good fit for your role.
              </p>

              {/* Suggested prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestedPrompt(prompt.text)}
                    disabled={chatMutation.isPending}
                    className={`flex items-start gap-3 p-4 rounded-lg ring-1 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 ${prompt.color}`}
                    id={`suggested-prompt-${i}`}
                  >
                    <prompt.icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium leading-snug">{prompt.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Chat messages ────────────────────────────── */
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((msg, i) => (
                <div
                  key={msg.messageId || i}
                  className={`flex items-start gap-3 animate-slide-up ${
                    msg.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                  style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                >
                  {/* Avatar */}
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center flex-shrink-0 shadow-soft-md shadow-brand-500/15 mt-0.5">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}

                  {/* Message bubble */}
                  <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
                    {msg.role === 'assistant' ? (
                      <div className="prose-sm">{renderMarkdown(msg.content)}</div>
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>

                  {/* User avatar placeholder */}
                  {msg.role === 'user' && (
                    <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-brand-700">You</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {chatMutation.isPending && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input area ─────────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-brand-100 bg-white/80 backdrop-blur-md p-4">
          <div className="max-w-3xl mx-auto">
            {chatMutation.isError && (
              <div className="mb-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 animate-slide-up">
                <span className="font-medium">Error:</span> {chatMutation.error?.message || 'Something went wrong. Please try again.'}
              </div>
            )}

            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about candidates, skills, or job matches..."
                  rows={1}
                  disabled={chatMutation.isPending}
                  className="input py-3 pr-12 resize-none min-h-[48px] max-h-32 text-sm"
                  style={{ height: 'auto' }}
                  onInput={e => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                  }}
                  id="chat-input"
                />
              </div>

              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || chatMutation.isPending}
                className="btn-primary h-12 w-12 p-0 rounded-lg flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                id="send-message-btn"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>

            <p className="text-[10px] text-brand-400 text-center mt-2">
              AI may make mistakes. Verify candidate information before making decisions.
            </p>
          </div>
        </div>
      </div>

      {/* ── Slide-right animation (for mobile sidebar) ─── */}
      <style>{`
        @keyframes slideRight {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
        .animate-slide-right {
          animation: slideRight 0.2s ease-out;
        }
      `}</style>
      </div>
    </div>
  );
}
