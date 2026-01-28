import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import sdk, { type Context } from '@farcaster/frame-sdk';
import { 
  getDailyQuote, 
  getQuoteById, 
  uploadQuoteImageToImgBB,
  generateSharingLink 
} from './services/Service';
import { Quote, FarcasterUser, Tab } from './types';
import QuoteCard from './components/QuoteCard';
import Header from './components/Header';
import Footer from './components/Footer';
import ClaimSuccessModal from './components/ClaimSuccessModal';
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { Toaster, toast } from 'sonner';
import { Loader2, CheckCircle2, Flame, Trophy, Share2, Star } from 'lucide-react';

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0xcB517c1Ba4587a5192eB8D4f45e1f8617a47a90c"; 
const NFT_CONTRACT_ADDRESS = "0x831e3158f427eb74a7b02Fa40E40daA1a9111568" as const; 
const CHAIN_ID = 8453; 
const RPC_URL = "https://mainnet.base.org";

// --- ABI ---
const CLAIM_ABI = parseAbi([
  'function checkInAndClaim() external',
  'function getCurrentDay() external view returns (uint256)',
  'function lastClaimDay(address user) external view returns (uint256)'
]);

const NFT_ABI = parseAbi([
  'function mint() external',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)'
]);

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL)
});

const App: React.FC = () => {
  // --- STATE ---
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  
  const [canClaim, setCanClaim] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [hasClaimedToday, setHasClaimedToday] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  
  const [nftSupply, setNftSupply] = useState<number>(0);
  const [hasMintedNFT, setHasMintedNFT] = useState<boolean>(false);
  const [isMintingNFT, setIsMintingNFT] = useState<boolean>(false);

  const toastIdRef = useRef<string | number | null>(null);

  // --- HELPERS ---
  const showToast = (message: string, type: 'loading' | 'success' | 'error', duration?: number) => {
    if (toastIdRef.current) toast.dismiss(toastIdRef.current);
    const toastFn = type === 'loading' ? toast.loading : type === 'success' ? toast.success : toast.error;
    toastIdRef.current = toastFn(message, { duration });
  };

  const checkChainId = async (): Promise<boolean> => {
    if (!sdk.wallet.ethProvider) return false;
    try {
      const chainIdHex = await sdk.wallet.ethProvider.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(chainIdHex as string, 16);
      return currentChainId === CHAIN_ID;
    } catch (error) {
      console.error("Error checking chain ID:", error);
      return false;
    }
  };

  // --- SCORE LOGIC ---
  const userScore = useMemo(() => {
    let score = 0;
    if (hasMintedNFT) score += 500;
    if (hasClaimedToday) score += 50;
    if (user) score += 10;
    return score;
  }, [hasMintedNFT, hasClaimedToday, user]);

  const userLevel = useMemo(() => {
    if (userScore < 100) return "Novice";
    if (userScore < 600) return "Seeker";
    return "Inspirator";
  }, [userScore]);

  // --- DATA FETCHING ---
  const fetchQuote = useCallback(async (quoteId?: string) => {
    setIsLoading(true);
    try {
        const quote = quoteId ? await getQuoteById(quoteId) : await getDailyQuote();
        setCurrentQuote(quote);
    } catch (error) {
        console.error("Error fetching quote:", error);
        showToast("Failed to load quote.", "error");
    } finally {
        setIsLoading(false);
    }
  }, []);

  const checkClaimStatus = useCallback(async (address: string) => {
    try {
      const [currentDayStr, lastClaimDayStr] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CLAIM_ABI, functionName: 'getCurrentDay' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CLAIM_ABI, functionName: 'lastClaimDay', args: [address as `0x${string}`] })
      ]);
      const isClaimed = Number(lastClaimDayStr) === Number(currentDayStr);
      setHasClaimedToday(isClaimed);
      if (isClaimed) setCanClaim(false); 
    } catch (error) {
      console.error("Failed to check claim status:", error);
    }
  }, []);

  const checkNftStatus = useCallback(async (address: string) => {
    try {
      const [supply, balance] = await Promise.all([
        publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: NFT_ABI, functionName: 'totalSupply' }) as Promise<bigint>,
        publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: NFT_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] }) as Promise<bigint>
      ]);
      setNftSupply(Number(supply));
      setHasMintedNFT(Number(balance) > 0);
    } catch (error) {
      console.error("Failed check NFT:", error);
    }
  }, []);

  // --- INIT ---
  useEffect(() => {
    const initSDK = async () => {
      try {
        const context: Context = await sdk.context;
        if (context.user) {
          setUser({ fid: context.user.fid, username: context.user.username, pfpUrl: context.user.pfpUrl, displayName: context.user.displayName });
        }
        if (sdk.wallet && sdk.wallet.ethProvider) {
           const accounts = await sdk.wallet.ethProvider.request({ method: 'eth_requestAccounts' }) as string[];
           if (accounts && accounts.length > 0) {
             const address = accounts[0];
             setUserAddress(address);
             checkClaimStatus(address);
             checkNftStatus(address);
           }
        }
        const params = new URLSearchParams(window.location.search);
        await fetchQuote(params.get('quoteId') || undefined);
        sdk.actions.ready();
      } catch (error) {
        console.error("SDK Error:", error);
        setIsLoading(false);
      }
    };
    initSDK();
  }, [fetchQuote, checkClaimStatus, checkNftStatus]);

  // --- HANDLERS ---
  const handleShare = async () => {
    if (!currentQuote) return;
    if (!hasClaimedToday) setCanClaim(true); 
    setIsSharing(true);
    showToast("Generating image...", "loading");
    try {
        let imageUrl: string | undefined;
        try {
            imageUrl = await uploadQuoteImageToImgBB(currentQuote);
        } catch (e) {
            console.error("ImgBB upload failed, sharing text only", e);
        }
        const shareLink = generateSharingLink(currentQuote.id, imageUrl);
        if (toastIdRef.current) toast.dismiss(toastIdRef.current);
        sdk.actions.openUrl(shareLink);
    } catch (error) {
        showToast("Error preparing share.", "error");
    } finally {
        setIsSharing(false);
    }
  };

  const handleClaim = async () => {
    if (!userAddress) return showToast("Connect wallet first", "error");
    setIsClaiming(true);
    showToast("Claiming reward...", "loading", 0);
    try {
      const isBase = await checkChainId();
      if (!isBase) await sdk.wallet.ethProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] });

      const hash = await sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{ to: CONTRACT_ADDRESS, from: userAddress, data: encodeFunctionData({ abi: CLAIM_ABI, functionName: "checkInAndClaim" }) }]
      });
      setClaimTxHash(hash as string);
      setHasClaimedToday(true);
      setCanClaim(false);
      setShowSuccessModal(true);
      showToast("Claimed successfully!", "success");
    } catch (error: any) {
      if (error.message?.includes("reverted")) {
         showToast("Transaction failed or already claimed.", "error");
         setHasClaimedToday(true);
      } else {
         showToast("Claim failed.", "error");
      }
    } finally {
      setIsClaiming(false);
    }
  };

  const handleMint = async () => {
    if (!userAddress) return showToast("Connect wallet first", "error");
    setIsMintingNFT(true);
    showToast("Minting NFT...", "loading", 0);
    try {
      const isBase = await checkChainId();
      if (!isBase) await sdk.wallet.ethProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] });

      const hash = await sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{ to: NFT_CONTRACT_ADDRESS, from: userAddress, data: encodeFunctionData({ abi: NFT_ABI, functionName: "mint" }) }]
      });
      showToast("Minted successfully!", "success");
      setHasMintedNFT(true);
      setNftSupply(prev => prev + 1);
    } catch (error: any) {
      if (error.message?.includes('reverted')) {
          showToast("Mint failed: Sold out or already minted?", "error");
      } else {
          showToast("Mint failed.", "error");
      }
    } finally {
      setIsMintingNFT(false);
    }
  };

  // --- RENDER ---
  return (
    // ROOT: Full Screen, No Scroll on Body
    <div className="h-screen w-full bg-[#0a0a0a] text-white flex flex-col relative overflow-hidden font-sans selection:bg-purple-500/30">
      <Toaster position="top-center" theme="dark" toastOptions={{ style: { background: 'rgba(39, 39, 42, 0.9)', border: '1px solid #3f3f46' } }}/>

      {/* BACKGROUND (Fixed) */}
      <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] bg-purple-900/20 rounded-full blur-[120px] animate-blob"></div>
          <div className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[70%] bg-blue-900/20 rounded-full blur-[120px] animate-blob delay-2000"></div>
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]"></div>
      </div>

      {/* HEADER (Z-INDEX CAO) */}
      <div className="relative z-20 w-full flex-none">
        <Header 
          user={user} 
          onClaim={handleClaim} 
          isClaiming={isClaiming} 
          canClaim={canClaim}
          hasClaimedToday={hasClaimedToday}
        />
      </div>

      {/* MAIN CONTENT (SCROLLABLE AREA) */}
      {/* flex-1 để chiếm hết chiều cao còn lại, overflow-y-auto để cuộn nội dung */}
      <div className="relative z-10 flex-1 w-full overflow-y-auto overflow-x-hidden scrollbar-hide">
        <main className="w-full min-h-full flex flex-col items-center px-4 pt-4 pb-28"> {/* pb-28 để tránh nội dung bị che bởi Footer */}
          
          {activeTab === Tab.HOME && (
              <QuoteCard
                quote={currentQuote}
                loading={isLoading}
                onNewQuote={() => fetchQuote()}
                onShare={handleShare}
              />
          )}

          {activeTab === Tab.MINT && (
            <div className="flex flex-col items-center justify-start w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="relative group w-full max-w-[400px] aspect-square mb-8 rounded-3xl overflow-hidden shadow-2xl border border-white/10 mt-4">
                 <img src="/nft-preview.png" alt="NFT" className="w-full h-full object-cover" 
                      onError={(e) => (e.target as HTMLImageElement).src = 'https://placehold.co/600x600/27272a/FFFFFF/png?text=NFT'} />
                 <div className="absolute bottom-4 right-4 px-4 py-1.5 bg-black/70 backdrop-blur rounded-full text-sm text-white border border-white/20">
                    {nftSupply}/100 Minted
                 </div>
               </div>
               
               <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400 mb-6">Genesis Badge</h2>
               
               <button 
                  onClick={handleMint}
                  disabled={isMintingNFT || hasMintedNFT || nftSupply >= 100}
                  className={`w-full max-w-[400px] py-4 rounded-xl font-bold text-xl transition-all flex items-center justify-center gap-3 shadow-lg
                    ${hasMintedNFT ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:scale-[1.02]'}`}
               >
                  {isMintingNFT ? <Loader2 className="animate-spin" /> : hasMintedNFT ? <CheckCircle2 /> : "Mint Free"}
                  {isMintingNFT ? "Minting..." : hasMintedNFT ? "Owned" : ""}
               </button>
            </div>
          )}

          {activeTab === Tab.REWARD && (
            <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* User Score Card - Full Width */}
              <div className="w-full bg-zinc-900/60 backdrop-blur-md border border-zinc-800 rounded-3xl p-6 mb-6 shadow-xl relative overflow-hidden mt-2">
                 <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Trophy size={160} />
                 </div>
                 
                 <div className="relative z-10 flex flex-col gap-2">
                    <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Total Score</span>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-6xl font-bold text-white tracking-tighter">{userScore}</h2>
                        <span className="text-emerald-400 text-xl font-medium">PTS</span>
                    </div>
                    
                    <div className="mt-4 flex items-center gap-3">
                        <div className="px-4 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-full text-purple-300 text-sm font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                            <Star size={14} fill="currentColor" />
                            {userLevel}
                        </div>
                        <div className="h-1.5 flex-grow bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 w-[60%] shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                        </div>
                    </div>
                 </div>
              </div>

              {/* Quest Board */}
              <div className="w-full space-y-4">
                 <h3 className="text-zinc-400 text-sm font-bold uppercase tracking-wider px-2 mb-1">Daily Quests</h3>
                 
                 {/* Quest Item 1 */}
                 <div className={`flex items-center justify-between p-5 rounded-2xl border transition-all hover:bg-zinc-800/40 ${hasClaimedToday ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-zinc-900/40 border-zinc-800'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${hasClaimedToday ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            <Flame size={24} className={hasClaimedToday ? 'fill-current' : ''} />
                        </div>
                        <div>
                            <p className={`font-bold text-lg ${hasClaimedToday ? 'text-emerald-100' : 'text-zinc-100'}`}>Daily Check-in</p>
                            <p className="text-xs text-zinc-500 font-medium tracking-wide">+50 PTS</p>
                        </div>
                    </div>
                    {hasClaimedToday ? (
                        <CheckCircle2 size={24} className="text-emerald-500" />
                    ) : (
                        <button 
                            onClick={handleClaim}
                            disabled={!canClaim || isClaiming}
                            className="px-4 py-2 bg-white text-black text-sm font-bold rounded-xl hover:bg-zinc-200 disabled:opacity-50"
                        >
                            {isClaiming ? '...' : canClaim ? 'Claim' : 'Locked'}
                        </button>
                    )}
                 </div>

                 {/* Quest Item 2 */}
                 <div className={`flex items-center justify-between p-5 rounded-2xl border transition-all hover:bg-zinc-800/40 ${hasMintedNFT ? 'bg-purple-950/20 border-purple-500/30' : 'bg-zinc-900/40 border-zinc-800'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${hasMintedNFT ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            <Trophy size={24} className={hasMintedNFT ? 'fill-current' : ''} />
                        </div>
                        <div>
                            <p className={`font-bold text-lg ${hasMintedNFT ? 'text-purple-100' : 'text-zinc-100'}`}>Genesis Badge</p>
                            <p className="text-xs text-zinc-500 font-medium tracking-wide">+500 PTS</p>
                        </div>
                    </div>
                    {hasMintedNFT ? (
                        <CheckCircle2 size={24} className="text-purple-500" />
                    ) : (
                        <button 
                            onClick={() => setActiveTab(Tab.MINT)}
                            className="px-4 py-2 bg-zinc-800 text-white text-sm font-bold rounded-xl hover:bg-zinc-700"
                        >
                            Go Mint
                        </button>
                    )}
                 </div>

                 {/* Quest Item 3 */}
                 <div className="flex items-center justify-between p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:bg-zinc-800/40">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <Share2 size={24} />
                        </div>
                        <div>
                            <p className="font-bold text-lg text-zinc-100">Share Quote</p>
                            <p className="text-xs text-zinc-500 font-medium tracking-wide">Repeatable</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setActiveTab(Tab.HOME)}
                        className="px-4 py-2 bg-zinc-800 text-white text-sm font-bold rounded-xl hover:bg-zinc-700"
                    >
                        Go Share
                    </button>
                 </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* FOOTER (FIXED ON TOP OF EVERYTHING) */}
      {/* Do Footer component gốc dùng 'absolute bottom-0', 
          để nó luôn nổi lên trên, ta đặt nó là con trực tiếp của Root relative */}
      <div className="z-50 w-full">
         <Footer activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      <ClaimSuccessModal 
        isOpen={showSuccessModal} 
        onClose={() => setShowSuccessModal(false)}
        onShare={() => sdk.actions.openUrl(`https://warpcast.com/~/compose?text=I%20just%20claimed%20rewards%20and%20leveled%20up%20on%20CastInspo!%20%F0%9F%94%A5`)}
      />
    </div>
  );
};

export default App;