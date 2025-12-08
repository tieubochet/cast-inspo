import React from 'react';
import { Gift, Loader2, Check } from 'lucide-react';
import { FarcasterUser } from '../types';

interface HeaderProps {
  user: FarcasterUser | null;
  canClaim: boolean;
  isClaiming: boolean;
  hasClaimedToday: boolean;
  onClaim: () => void;
}

const Header: React.FC<HeaderProps> = ({ user, canClaim, isClaiming, hasClaimedToday, onClaim }) => {
  // Fallback data if user is not connected (e.g. testing in browser)
  const displayUser = user || {
    username: 'Guest',
    fid: 0,
    pfpUrl: 'https://picsum.photos/100/100',
    displayName: 'Guest User'
  };

  return (
    <div className="w-full px-4 pt-4 pb-2 sticky top-0 z-50">
      <div className="bg-zinc-800/80 backdrop-blur-md text-white rounded-2xl p-3 flex items-center justify-between shadow-lg border border-zinc-700/50">
        {/* Left: Avatar & User Info */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={displayUser.pfpUrl || "https://picsum.photos/100/100"}
              alt="Avatar"
              className="w-10 h-10 rounded-full border border-zinc-600 object-cover"
              onError={(e) => {
                // Fallback if image fails to load
                (e.target as HTMLImageElement).src = "https://picsum.photos/100/100";
              }}
            />
            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-800 ${user ? 'bg-emerald-500' : 'bg-zinc-500'}`}></div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-wide text-zinc-100 truncate max-w-[120px]">
              {displayUser.displayName || displayUser.username}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              FID : {displayUser.fid > 0 ? displayUser.fid : '---'}
            </span>
          </div>
        </div>

        {/* Right: Claim Button */}
        {/* Logic: 
            1. If hasClaimedToday -> Green 'Claimed' (Disabled)
            2. If isClaiming -> Loading Spinner
            3. If canClaim -> Gold 'Claim' (Enabled)
            4. Default -> Gray 'Claim' (Disabled)
        */}
        <button
          onClick={onClaim}
          disabled={!canClaim || isClaiming || hasClaimedToday}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 border 
            ${
              hasClaimedToday
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 cursor-default'
                : canClaim 
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/50 hover:bg-amber-400/30 cursor-pointer shadow-[0_0_15px_rgba(251,191,36,0.3)]' 
                  : 'bg-zinc-700/30 text-zinc-500 border-zinc-700/50 cursor-not-allowed'
            }`}
        >
          {isClaiming ? (
            <Loader2 size={14} className="animate-spin" />
          ) : hasClaimedToday ? (
            <Check size={14} />
          ) : (
            <Gift size={14} />
          )}
          
          <span>
            {isClaiming 
              ? 'Claiming...' 
              : hasClaimedToday 
                ? 'Claimed' 
                : 'Claim'}
          </span>
        </button>
      </div>
    </div>
  );
};

export default Header;