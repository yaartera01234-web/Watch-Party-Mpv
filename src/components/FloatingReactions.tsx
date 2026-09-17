import React from 'react';
import { ReactionEvent } from '../types';

interface FloatingReactionsProps {
  reactions: ReactionEvent[];
}

export const FloatingReactions: React.FC<FloatingReactionsProps> = ({ reactions }) => {
  return (
    <div 
      id="floating-reactions-overlay" 
      className="absolute inset-0 pointer-events-none overflow-hidden z-20"
    >
      {reactions.map((r) => (
        <div
          key={r.id}
          className="absolute bottom-8 animate-float-reaction flex flex-col items-center select-none pointer-events-none"
          style={{
            left: `${r.x}%`,
          }}
        >
          <span className="text-3xl sm:text-4xl filter drop-shadow-md">
            {r.emoji}
          </span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/60 text-white/90 backdrop-blur-sm mt-0.5 whitespace-nowrap">
            {r.senderName}
          </span>
        </div>
      ))}
    </div>
  );
};
