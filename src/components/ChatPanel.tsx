import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Send, 
  Smile, 
  Reply, 
  X, 
  Users, 
  Volume2, 
  VolumeX, 
  Bell,
  BellRing,
  CornerDownRight,
  ChevronRight
} from 'lucide-react';
import { ChatMessage, User } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  members: User[];
  currentUserId: string;
  typingText: string | null;
  soundEnabled: boolean;
  onSendMessage: (text: string, replyTo?: { name: string; text: string } | null) => void;
  onTyping: () => void;
  onToggleSound: () => void;
  /** READINESS GATE: gate khula hai (sab ke buffer hone ka intezaar) */
  waitingForReady?: boolean;
  /** Apni ready state */
  isSelfReady?: boolean;
  /** Manual "main tayyar hoon" toggle */
  onToggleReady?: () => void;
}

interface SwipeableMessageProps {
  msg: ChatMessage;
  isMe: boolean;
  currentUserId: string;
  members: User[];
  onReply: (target: { name: string; text: string }) => void;
  renderAvatar: (user?: Partial<User>, fallbackName?: string, size?: number) => React.ReactNode;
  onScrollToMessage?: (id: string) => void;
}

const SwipeableMessage: React.FC<SwipeableMessageProps> = ({
  msg,
  isMe,
  members,
  onReply,
  renderAvatar,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isTriggered, setIsTriggered] = useState(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isHorizontalScrollRef = useRef<boolean | null>(null);
  const vibratedRef = useRef(false);

  const TRIGGER_THRESHOLD = 45;

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startPosRef.current = { x: clientX, y: clientY };
    isHorizontalScrollRef.current = null;
    vibratedRef.current = false;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!startPosRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const dx = clientX - startPosRef.current.x;
    const dy = clientY - startPosRef.current.y;

    // Detect if user intended horizontal swipe vs vertical scroll
    if (isHorizontalScrollRef.current === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        isHorizontalScrollRef.current = Math.abs(dx) > Math.abs(dy);
      }
    }

    if (!isHorizontalScrollRef.current) {
      return; // Normal vertical chat scrolling
    }

    // Swipe right to reply
    if (dx > 0) {
      const dampened = Math.min(80, dx * 0.7);
      setOffsetX(dampened);

      if (dampened >= TRIGGER_THRESHOLD) {
        setIsTriggered(true);
        if (!vibratedRef.current) {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(20);
          }
          vibratedRef.current = true;
        }
      } else {
        setIsTriggered(false);
      }
    }
  };

  const handleTouchEnd = () => {
    if (offsetX >= TRIGGER_THRESHOLD) {
      onReply({ name: isMe ? 'You' : msg.name, text: msg.text });
      // Auto focus input
      const input = document.getElementById('chat-message-input') as HTMLInputElement | null;
      input?.focus();
    }
    // Reset
    startPosRef.current = null;
    isHorizontalScrollRef.current = null;
    setIsSwiping(false);
    setIsTriggered(false);
    setOffsetX(0);
  };

  const globalAvs = (typeof window !== 'undefined' ? (window as any).__wp_avatars : null) || {};
  const senderUser = members.find(
    (m) => m.id === msg.senderId || m.name.toLowerCase() === msg.name.toLowerCase()
  ) || {
    name: msg.name,
    color: msg.color,
    avatar: globalAvs[msg.name.toLowerCase()] || { type: 'letter' },
  };

  return (
    <div 
      className="relative overflow-hidden py-0.5"
      id={`msg-wrap-${msg.id}`}
    >
      {/* Swipe Reply indicator background behind the bubble */}
      <div 
        className={`absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-150 pointer-events-none ${
          offsetX > 5 ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          width: `${Math.max(0, offsetX)}px`,
          transform: `scale(${Math.min(1.15, Math.max(0.6, offsetX / TRIGGER_THRESHOLD))})`,
        }}
      >
        <div 
          className={`w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-colors ${
            isTriggered 
              ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white scale-110 ring-2 ring-pink-400/50' 
              : 'bg-white/10 text-pink-400 border border-white/20'
          }`}
        >
          <Reply className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Actual Message Row */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseMove={(e) => startPosRef.current && handleTouchMove(e)}
        onMouseUp={handleTouchEnd}
        onDoubleClick={() => onReply({ name: isMe ? 'You' : msg.name, text: msg.text })}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
        className={`flex gap-2 items-end group ${isMe ? 'justify-end' : 'justify-start'} touch-pan-y select-text cursor-grab active:cursor-grabbing`}
      >
        {!isMe && renderAvatar(senderUser, msg.name, 28)}

        <div className={`max-w-[80%] sm:max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
          {/* Sender Header */}
          <div className="flex items-center gap-1.5 mb-0.5 px-1">
            <span 
              className="text-[11px] font-bold"
              style={{ color: isMe ? '#f472b6' : msg.color || '#c084fc' }}
            >
              {isMe ? 'You' : msg.name}
            </span>

            {/* Quick visible reply button for desktop or accessibility */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReply({ name: isMe ? 'You' : msg.name, text: msg.text });
              }}
              className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-pink-300 transition-opacity p-0.5 rounded hover:bg-white/10"
              title="Swipe right or click to reply"
            >
              <Reply className="w-3 h-3" />
            </button>
          </div>

          {/* Chat Bubble */}
          <div
            className={`p-2.5 rounded-2xl relative shadow-md leading-relaxed break-words text-xs sm:text-sm ${
              isMe
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-br-sm'
                : 'bg-white/10 border border-white/10 text-neutral-100 rounded-bl-sm'
            }`}
          >
            {/* Quoted reply banner if this message is replying to another */}
            {msg.reply && (
              <div className="mb-1.5 p-1.5 rounded-lg bg-black/40 border-l-2 border-emerald-400 text-[11px] text-neutral-300 flex flex-col select-none">
                <span className="font-bold text-emerald-300 flex items-center gap-1">
                  <CornerDownRight className="w-3 h-3" />
                  {msg.reply.name}
                </span>
                <span className="truncate max-w-[220px] opacity-80 pl-4 italic">
                  "{msg.reply.text}"
                </span>
              </div>
            )}

            <span>{msg.text}</span>
          </div>

          {/* Time & swipe hint */}
          <div className="flex items-center gap-1 px-1 mt-0.5">
            <span className="text-[10px] text-neutral-400">
              {msg.time} {isMe && '✓✓'}
            </span>
          </div>
        </div>

        {isMe && renderAvatar(senderUser, msg.name, 28)}
      </div>
    </div>
  );
};

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  members,
  currentUserId,
  typingText,
  soundEnabled,
  onSendMessage,
  onTyping,
  onToggleSound,
  waitingForReady = false,
  isSelfReady = false,
  onToggleReady,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyTarget, setReplyTarget] = useState<{ name: string; text: string } | null>(null);
  const [notifGranted, setNotifGranted] = useState<boolean>(() => {
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const handleToggleNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      setNotifGranted(true);
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setNotifGranted(res === 'granted');
    } catch {
      // ignore
    }
  };

  // Auto-scroll inside chat container ONLY so window/player NEVER moves up
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, typingText]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed, replyTarget);
    setInputText('');
    setReplyTarget(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const addEmojiToInput = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  const handleReplyAction = useCallback((target: { name: string; text: string }) => {
    setReplyTarget(target);
    const input = document.getElementById('chat-message-input') as HTMLInputElement | null;
    input?.focus();
  }, []);

  const renderAvatar = (user?: Partial<User>, fallbackName = '?', size = 30) => {
    const letter = (fallbackName[0] || '?').toUpperCase();
    const globalAvs = (typeof window !== 'undefined' ? (window as any).__wp_avatars : null) || {};
    const avatar = user?.avatar || globalAvs[fallbackName.toLowerCase()];
    const bg = user?.color || '#a855f7';
    const imgSrc = avatar?.url || avatar?.data;

    if (imgSrc) {
      return (
        <img
          src={imgSrc}
          alt={fallbackName}
          className="rounded-full object-cover shrink-0 ring-1 ring-white/20"
          style={{ width: `${size}px`, height: `${size}px` }}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      );
    }
    return (
      <div
        className="rounded-full flex items-center justify-center font-bold text-white shrink-0 shadow-sm"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: bg,
          fontSize: `${Math.max(10, Math.round(size * 0.42))}px`,
        }}
      >
        {letter}
      </div>
    );
  };

  return (
    <div 
      id="live-chat-panel"
      className="flex flex-col h-full rounded-2xl bg-gradient-to-b from-[#141029] to-[#0c0a1a] border border-white/10 shadow-xl overflow-hidden"
    >
      {/* Header with Member chips */}
      <div className="p-3 border-b border-white/10 bg-black/20 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-pink-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Party Members ({members.length})
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-400 hidden xs:inline">
              👉 Swipe message to reply
            </span>
            {/* Background notification bell */}
            {typeof window !== 'undefined' && 'Notification' in window && (
              <button
                onClick={handleToggleNotification}
                className={`p-1 rounded-lg transition-colors ${
                  notifGranted ? 'text-amber-400 hover:bg-amber-500/10' : 'text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
                title={notifGranted ? 'Background notifications active' : 'Click to allow background message notifications'}
              >
                {notifGranted ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              onClick={onToggleSound}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-pink-400" /> : <VolumeX className="w-3.5 h-3.5 text-neutral-400" />}
            </button>
          </div>
        </div>

        {/* Member avatar chips horizontal list */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10 shrink-0 text-xs text-neutral-200"
              style={{ borderLeftColor: m.color, borderLeftWidth: '3px' }}
            >
              {renderAvatar(m, m.name, 18)}
              <span className="truncate max-w-[80px] font-medium text-[11px]">
                {m.name} {m.id === currentUserId && '(You)'}
              </span>
              {/* READINESS dot: 🟢 tayyar · 🟡 load ho raha */}
              {m.isReady !== undefined && (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    m.isReady ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                  }`}
                  title={m.isReady ? 'Tayyar' : 'Load ho raha hai...'}
                />
              )}
            </div>
          ))}
        </div>

        {/* READINESS GATE banner — kis ka intezaar hai + manual ready button */}
        {waitingForReady && (
          <div className="mt-1.5 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
            <span className="text-[11px] text-amber-200 truncate">
              ⏳ Sab ke tayyar hone ka intezaar...
              {(() => {
                const pending = members.filter((m) => m.isReady !== true).map((m) => m.name);
                return pending.length ? ` (${pending.join(', ')})` : '';
              })()}
            </span>
            {onToggleReady && (
              <button
                type="button"
                id="ready-toggle-btn"
                onClick={onToggleReady}
                className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-md border transition active:scale-95 ${
                  isSelfReady
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                    : 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                }`}
              >
                {isSelfReady ? '✅ Ready' : 'Main tayyar hoon'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages list */}
      <div
        ref={chatScrollRef}
        id="chat-messages-container"
        className="flex-1 p-3 overflow-y-auto space-y-1 min-h-0 text-xs no-scrollbar overscroll-contain"
        style={{ overscrollBehavior: 'contain' }}
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-neutral-400">
            <p className="text-xs font-medium text-white mb-1">No messages yet</p>
            <p className="text-[11px] text-neutral-400">
              Say hello or react to what is playing! (Swipe any message to reply)
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-1.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-medium text-center">
                    {msg.text}
                  </span>
                </div>
              );
            }

            const isMe = msg.senderId === currentUserId;

            return (
              <SwipeableMessage
                key={msg.id}
                msg={msg}
                isMe={isMe}
                currentUserId={currentUserId}
                members={members}
                onReply={handleReplyAction}
                renderAvatar={renderAvatar}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingText && (
        <div className="px-3 py-1 text-[11px] font-semibold text-emerald-400 bg-black/20 shrink-0 italic animate-pulse flex items-center gap-1.5">
          <span>✍️</span>
          <span>{typingText}</span>
        </div>
      )}

      {/* Input area */}
      <div className="p-2.5 border-t border-white/10 bg-black/30 shrink-0 space-y-2">
        {/* Reply Preview Bar */}
        {replyTarget && (
          <div 
            id="reply-target-banner"
            className="flex items-center justify-between p-2 rounded-xl bg-purple-950/60 border border-pink-500/40 text-xs text-neutral-200 animate-in fade-in slide-in-from-bottom-2"
          >
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <div className="w-6 h-6 rounded-lg bg-pink-500/20 flex items-center justify-center shrink-0">
                <Reply className="w-3.5 h-3.5 text-pink-400" />
              </div>
              <div className="truncate">
                <div className="font-bold text-[11px] text-pink-300 flex items-center gap-1">
                  <span>Replying to {replyTarget.name}</span>
                </div>
                <div className="text-[11px] text-neutral-300 opacity-90 truncate">
                  {replyTarget.text}
                </div>
              </div>
            </div>
            <button
              onClick={() => setReplyTarget(null)}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
              title="Cancel reply"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Emoji bar */}
        <div className="flex items-center gap-1 justify-between px-1">
          {['😂', '❤️', '🔥', '😭', '👏', '🥳', '🍿', '👍'].map((e) => (
            <button
              key={e}
              onClick={() => addEmojiToInput(e)}
              className="text-base hover:scale-125 transition-transform p-0.5"
            >
              {e}
            </button>
          ))}
        </div>

        {/* Text input and send */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            id="chat-message-input"
            type="text"
            enterKeyHint="send"
            autoComplete="off"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              onTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={replyTarget ? `Reply to ${replyTarget.name}...` : "Type a message (Swipe to reply)..."}
            maxLength={500}
            className="flex-1 bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-neutral-400 focus:outline-none focus:border-pink-500 transition-colors"
          />

          <button
            id="chat-send-btn"
            type="submit"
            /* DUPLICATE-MESSAGE FIX: yahan pehle onClick={handleSend} bhi tha.
               type="submit" hone ki wajah se click par form ka onSubmit BHI
               chalta hai -> handleSend() do baar -> har message chat mein
               do martaba. Ab sirf form onSubmit handle karta hai. */
            className="p-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 disabled:opacity-40 text-white shadow-md transition-all active:scale-95 shrink-0"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
