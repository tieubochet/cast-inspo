import React from 'react';
import { Share2, X, Sparkles, PartyPopper } from 'lucide-react';

interface ClaimSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShare: () => void;
}

const ClaimSuccessModal: React.FC<ClaimSuccessModalProps> = ({ isOpen, onClose, onShare }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="relative bg-zinc-900 border border-emerald-500/30 rounded-2xl p-6 w-full max-w-sm shadow-[0_0_50px_rgba(16,185,129,0.3)] flex flex-col items-center">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 text-zinc-400 hover:text-white transition-colors p-1"
        >
          <X size={20} />
        </button>

        {/* Icon/Image */}
        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)] mb-4 relative mt-2">
          <Sparkles className="text-emerald-400 absolute top-0 right-0 animate-pulse" size={20} />
          <PartyPopper className="text-emerald-400 w-8 h-8" />
        </div>

        {/* Text */}
        <div className="text-center space-y-2 mb-6">
          <h3 className="text-2xl font-bold text-white tracking-tight">
            Reward Claimed!
          </h3>
          <p className="text-zinc-300 text-sm leading-relaxed">
            You've successfully checked in on-chain. Keep your streak alive to unlock exclusive rewards!
          </p>
        </div>

        {/* Actions */}
        <div className="w-full space-y-3">
          <button
            onClick={onShare}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-transform active:scale-95"
          >
            <Share2 size={18} />
            Share & Invite Friends
          </button>
          
          <button
            onClick={onClose}
            className="w-full py-3 text-zinc-500 text-sm font-medium hover:text-zinc-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClaimSuccessModal;