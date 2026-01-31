import React, { useState } from 'react';
import { Quote, QuoteTheme } from '../types';
import { THEMES, createQuoteImage } from '../services/Service'; 
import { Share2, RefreshCw, Loader2, Palette } from 'lucide-react';

interface QuoteCardProps {
  quote: Quote | null;
  loading: boolean;
  onNewQuote: () => void;
  onShare: () => void;
 
  onQuoteUpdate?: (updatedQuote: Quote) => void; 
}

const QuoteCard: React.FC<QuoteCardProps> = ({ quote, loading, onNewQuote, onShare, onQuoteUpdate }) => {
  const [activeThemeId, setActiveThemeId] = useState<string>('classic');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const handleThemeChange = async (theme: QuoteTheme) => {
    if (!quote) return;
    setActiveThemeId(theme.id);
    setIsGenerating(true);

    try {
        const newImageUrl = await createQuoteImage(quote.text, quote.author, theme.id);
        const updatedQuote = { ...quote, imageUrl: newImageUrl };
        if (onQuoteUpdate) {
            onQuoteUpdate(updatedQuote);
        }
    } catch (error) {
        console.error("Theme change failed", error);
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center pt-2 pb-6 flex-grow gap-4">
      {/* DISPLAY CONTAINER */}
      <div className="aspect-[3/2] w-full relative rounded-[10px] shadow-2xl overflow-hidden transform transition-all duration-500 bg-zinc-800 border border-white/10 group">
        <div className="w-full h-full flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-10 h-10 text-white/80 animate-spin" />
              <p className="text-white/80 text-xs font-medium uppercase tracking-widest">Generating...</p>
            </div>
          ) : quote?.imageUrl ? (
             <>
                <img 
                  src={quote.imageUrl} 
                  alt="Quote"
                  className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${isGenerating ? 'opacity-50 blur-sm' : 'opacity-100'}`} 
                />
                {isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <Loader2 className="animate-spin text-white" size={32} />
                    </div>
                )}
             </>
          ) : (
            <div className="text-zinc-500">No Preview</div>
          )}
        </div>
      </div>

      {/* THEME SELECTOR (NEW) */}
      <div className="w-full bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-xl p-3 flex items-center justify-between shadow-lg">
         <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-bold uppercase tracking-wider mr-2">
            <Palette size={14} /> Style
         </div>
         <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {THEMES.map((theme) => (
                <button
                    key={theme.id}
                    onClick={() => handleThemeChange(theme)}
                    className={`w-6 h-6 rounded-full border border-white/20 flex-shrink-0 transition-all hover:scale-110 ${activeThemeId === theme.id ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'}`}
                    style={{ background: `linear-gradient(135deg, ${theme.bg[0]}, ${theme.bg[1] || theme.bg[0]})` }}
                    title={theme.name}
                />
            ))}
         </div>
      </div>

      {/* ACTIONS */}
      <div className="w-full grid grid-cols-2 gap-4 px-1">
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