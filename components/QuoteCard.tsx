import React from 'react';
import { Quote } from '../types';
import { Share2, RefreshCw, Loader2 } from 'lucide-react';

interface QuoteCardProps {
  quote: Quote | null;
  loading: boolean;
  onNewQuote: () => void;
  onShare: () => void;
}

const QuoteCard: React.FC<QuoteCardProps> = ({ quote, loading, onNewQuote, onShare }) => {
  return (
    <div className="w-full flex flex-col items-center justify-center pt-2 pb-6 flex-grow gap-6">
      {/* Quote Display Container */}
      <div className="aspect-[6/4] w-full relative rounded-3xl shadow-2xl overflow-hidden transform transition-all duration-500 bg-[#6A3CFF] border-[3px] border-white">
        
        {/* Content Area */}
        <div className="w-full h-full flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-10 h-10 text-white/80 animate-spin" />
              <p className="text-white/80 text-xs font-medium uppercase tracking-widest">Generating...</p>
            </div>
          ) : quote?.imageUrl ? (
             <img 
               src={quote.imageUrl} 
               alt={`${quote.text} - ${quote.author}`}
               className="w-full h-full object-cover"
             />
          ) : (
            // Fallback text view - Styled to match the generated image
            <div className="p-8 text-center flex flex-col items-center justify-center h-full">
               <div className="bg-white text-[#6A3CFF] w-14 h-14 rounded-full flex items-center justify-center mb-6 shadow-md">
                 <span className="text-4xl font-sans font-bold leading-none mt-2">“</span>
               </div>
              <p className="text-3xl md:text-5xl text-white leading-relaxed italic mb-6 drop-shadow-sm font-['Arsenal']">
                {quote?.text}
              </p>
              <p className="text-amber-300 font-bold text-xl md:text-2xl tracking-wide font-['Quicksand']">
                - {quote?.author}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons - Outside the card */}
      <div className="w-full grid grid-cols-2 gap-4 px-2">
        <button
          onClick={onNewQuote}
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 font-semibold py-3.5 px-4 rounded-xl transition-all disabled:opacity-50 text-sm border border-zinc-700/50 shadow-lg"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          New Quote
        </button>
        
        <button
          onClick={onShare}
          disabled={loading || !quote}
          className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 text-sm"
        >
          <Share2 size={18} />
          Share
        </button>
      </div>
    </div>
  );
};

export default QuoteCard;