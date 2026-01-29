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
import { Loader2, CheckCircle2, Flame, Trophy, Share2, Star, Sparkles, Image as ImageIcon } from 'lucide-react';

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0xcB517c1Ba4587a5192eB8D4f45e1f8617a47a90c"; 
const GENESIS_NFT_CONTRACT = "0x831e3158f427eb74a7b02Fa40E40daA1a9111568" as const; 
const DAILY_NFT_CONTRACT = "0x0636503Eb16296bA79Bd4442098095656b0126CE" as const; 

const CHAIN_ID = 8453; 
const RPC_URL = "https://mainnet.base.org";

// --- ABI ---
const CLAIM_ABI = parseAbi([
  'function checkInAndClaim() external',
  'function getCurrentDay() external view returns (uint256)',
  'function lastClaimDay(address user) external view returns (uint256)'
]);

// ERC721 Standard ABI (Dùng chung cho cả Genesis và Daily Quote để check balance)
const ERC721_ABI = parseAbi([
  'function mint() external', // Cho Genesis
  'function mintQuote(string uri) external', // Cho Daily Quote
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
  
  // Genesis NFT State
  const [genesisSupply, setGenesisSupply] = useState<number>(0);
  const [hasGenesisNFT, setHasGenesisNFT] = useState<boolean>(false);
  const [isMintingGenesis, setIsMintingGenesis] = useState<boolean>(false);

  // Daily Quote NFT State
  const [dailyQuoteCount, setDailyQuoteCount] = useState<number>(0); // Đếm số lượng quote đã mint
  const [isMintingDaily, setIsMintingDaily] = useState<boolean>(false);

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

  // --- SCORE LOGIC (UPDATED) ---
  const userScore = useMemo(() => {
    let score = 0;
    if (hasGenesisNFT) score += 500;
    if (hasClaimedToday) score += 50;
    if (dailyQuoteCount > 0) score += (dailyQuoteCount * 20); // +20 điểm cho mỗi Quote đã mint
    if (user) score += 10;
    return score;
  }, [hasGenesisNFT, hasClaimedToday, dailyQuoteCount, user]);

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

  const checkNFTsStatus = useCallback(async (address: string) => {
    try {
      // Check Genesis
      const [genSupply, genBalance] = await Promise.all([
        publicClient.readContract({ address: GENESIS_NFT_CONTRACT, abi: ERC721_ABI, functionName: 'totalSupply' }) as Promise<bigint>,
        publicClient.readContract({ address: GENESIS_NFT_CONTRACT, abi: ERC721_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] }) as Promise<bigint>
      ]);
      setGenesisSupply(Number(genSupply));
      setHasGenesisNFT(Number(genBalance) > 0);

      // Check Daily Quote Count
      const dailyBalance = await publicClient.readContract({ 
        address: DAILY_NFT_CONTRACT, 
        abi: ERC721_ABI, 
        functionName: 'balanceOf', 
        args: [address as `0x${string}`] 
      }) as bigint;
      setDailyQuoteCount(Number(dailyBalance));

    } catch (error) {
      console.error("Failed check NFTs:", error);
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
             checkNFTsStatus(address);
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
  }, [fetchQuote, checkClaimStatus, checkNFTsStatus]);

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

  const handleMintGenesis = async () => {
    if (!userAddress) return showToast("Connect wallet first", "error");
    setIsMintingGenesis(true);
    showToast("Minting Genesis...", "loading", 0);
    try {
      const isBase = await checkChainId();
      if (!isBase) await sdk.wallet.ethProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] });

      const hash = await sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{ to: GENESIS_NFT_CONTRACT, from: userAddress, data: encodeFunctionData({ abi: ERC721_ABI, functionName: "mint" }) }]
      });
      showToast("Minted Genesis successfully!", "success");
      setHasGenesisNFT(true);
      setGenesisSupply(prev => prev + 1);
    } catch (error: any) {
      if (error.message?.includes('reverted')) {
          showToast("Mint failed: Sold out or already minted?", "error");
      } else {
          showToast("Mint failed.", "error");
      }
    } finally {
      setIsMintingGenesis(false);
    }
  };

  const handleMintDailyQuote = async () => {
    if (!userAddress) return showToast("Connect wallet first", "error");
    if (!currentQuote) return showToast("No quote loaded", "error");

    setIsMintingDaily(true);
    showToast("Preparing Quote...", "loading");

    try {
        // 1. Upload & Prepare Metadata
        let imageUrl = currentQuote.imageUrl;
        if (!imageUrl || imageUrl.startsWith('data:')) {
            showToast("Uploading image...", "loading");
            imageUrl = await uploadQuoteImageToImgBB(currentQuote);
        }

        const metadata = {
            name: `CastInspo Daily #${currentQuote.id}`,
            description: `"${currentQuote.text}" - ${currentQuote.author}`,
            image: imageUrl,
            attributes: [
                { trait_type: "Author", value: currentQuote.author },
                { trait_type: "Source", value: "CastInspo" }
            ]
        };
        const metadataURI = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;

        // 2. Mint
        const isBase = await checkChainId();
        if (!isBase) await sdk.wallet.ethProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] });

        const hash = await sdk.wallet.ethProvider.request({
            method: 'eth_sendTransaction',
            params: [{ 
                to: DAILY_NFT_CONTRACT, 
                from: userAddress, 
                data: encodeFunctionData({ 
                    abi: ERC721_ABI, 
                    functionName: "mintQuote",
                    args: [metadataURI]
                }) 
            }]
        });

        console.log("Mint Hash:", hash);
        showToast("Quote minted! +20 Points", "success");
        setDailyQuoteCount(prev => prev + 1); // Cập nhật điểm ngay lập tức

    } catch (error: any) {
        console.error("Mint Daily Error:", error);
        if (error.code === 4001) {
            showToast("Mint Cancelled", "error");
        } else {
            showToast("Mint failed.", "error");
        }
    } finally {
        setIsMintingDaily(false);
    }
  };

  // --- RENDER ---
  return (
    <div className="h-screen w-full bg-[#0a0a0a] text-white flex flex-col relative overflow-hidden font-sans selection:bg-purple-500/30">
      <Toaster position="top-center" theme="dark" toastOptions={{ style: { background: 'rgba(39, 39, 42, 0.9)', border: '1px solid #3f3f46' } }}/>

      {/* BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] bg-purple-900/20 rounded-full blur-[120px] animate-blob"></div>
          <div className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[70%] bg-blue-900/20 rounded-full blur-[120px] animate-blob delay-2000"></div>
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]"></div>
      </div>

      {/* HEADER */}
      <div className="relative z-20 w-full flex-none">
        <Header 
          user={user} 
          onClaim={handleClaim} 
          isClaiming={isClaiming} 
          canClaim={canClaim}
          hasClaimedToday={hasClaimedToday}
        />
      </div>

      {/* MAIN CONTENT */}
      <div className="relative z-10 flex-1 w-full overflow-y-auto overflow-x-hidden scrollbar-hide">
        <main className="w-full min-h-full flex flex-col items-center px-4 pt-4 pb-28">
          
          {activeTab === Tab.HOME && (
              <QuoteCard
                quote={currentQuote}
                loading={isLoading}
                onNewQuote={() => fetchQuote()}
                onShare={handleShare}
              />
          )}

          {activeTab === Tab.MINT && (
            <div className="flex flex-col items-center justify-start w-full animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
               
               {/* DAILY QUOTE SECTION */}
               <div className="w-full max-w-[400px] bg-zinc-900/60 backdrop-blur-md border border-zinc-800 rounded-3xl p-5 shadow-lg">
                   <div className="flex items-center gap-2 mb-4">
                       <Sparkles className="text-amber-400" size={20} />
                       <div className="flex flex-col">
                         <h3 className="text-lg font-bold text-white leading-none">Quote of the Day</h3>
                         <span className="text-xs text-amber-300 font-medium">+20 Points per Mint</span>
                       </div>
                   </div>
                   
                   <div className="aspect-[3/2] w-full bg-zinc-800 rounded-xl overflow-hidden mb-4 relative">
                        {currentQuote?.imageUrl ? (
                             <img src={currentQuote.imageUrl} alt="Quote" className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex items-center justify-center h-full text-zinc-500 gap-2">
                                <ImageIcon size={24} />
                                <span className="text-xs">Preview loading...</span>
                            </div>
                        )}
                   </div>

                   <button 
                      onClick={handleMintDailyQuote}
                      disabled={isMintingDaily || isLoading}
                      className="w-full py-3 rounded-xl font-bold text-base bg-gradient-to-r from-amber-400 to-orange-500 text-black hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                   >
                      {isMintingDaily ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                      {isMintingDaily ? "Minting..." : "Mint & Earn 20 PTS"}
                   </button>
               </div>


               {/* GENESIS BADGE SECTION */}
               <div className="w-full max-w-[400px] opacity-90 hover:opacity-100 transition-opacity">
                   <div className="flex items-center gap-2 mb-2 px-1">
                       <Trophy className="text-purple-400" size={18} />
                       <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Genesis Collection</h3>
                   </div>
                   
                   <div className="relative group w-full aspect-square rounded-3xl overflow-hidden shadow-2xl border border-white/10">
                        <img src="/nft-preview.png" alt="NFT" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" 
                                onError={(e) => (e.target as HTMLImageElement).src = 'https://placehold.co/600x600/27272a/FFFFFF/png?text=NFT'} />
                        <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/70 backdrop-blur rounded-full text-xs text-white border border-white/20">
                            {genesisSupply}/100 Minted
                        </div>
                        
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-6">
                            <h2 className="text-2xl font-bold text-white mb-2">Genesis Badge</h2>
                            <button 
                                onClick={handleMintGenesis}
                                disabled={isMintingGenesis || hasGenesisNFT || genesisSupply >= 100}
                                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                                    ${hasGenesisNFT ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-white text-black hover:bg-zinc-200'}`}
                            >
                                {isMintingGenesis ? <Loader2 className="animate-spin" size={16} /> : hasGenesisNFT ? <CheckCircle2 size={16} /> : "Mint Genesis"}
                                {isMintingGenesis ? "Processing..." : hasGenesisNFT ? "Owned (+500 PTS)" : "Mint Free (+500 PTS)"}
                            </button>
                        </div>
                   </div>
               </div>
            </div>
          )}

          {activeTab === Tab.REWARD && (
            <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              
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

              <div className="w-full space-y-4">
                 <h3 className="text-zinc-400 text-sm font-bold uppercase tracking-wider px-2 mb-1">Daily Quests</h3>
                 
                 {/* 1. CHECK IN */}
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
                        <button onClick={handleClaim} disabled={!canClaim || isClaiming} className="px-4 py-2 bg-white text-black text-sm font-bold rounded-xl hover:bg-zinc-200 disabled:opacity-50">
                            {isClaiming ? '...' : canClaim ? 'Claim' : 'Locked'}
                        </button>
                    )}
                 </div>

                 {/* 2. MINT QUOTE (NEW) */}
                 <div className={`flex items-center justify-between p-5 rounded-2xl border transition-all hover:bg-zinc-800/40 ${dailyQuoteCount > 0 ? 'bg-amber-950/20 border-amber-500/30' : 'bg-zinc-900/40 border-zinc-800'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${dailyQuoteCount > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            <Sparkles size={24} className={dailyQuoteCount > 0 ? 'fill-current' : ''} />
                        </div>
                        <div>
                            <p className={`font-bold text-lg ${dailyQuoteCount > 0 ? 'text-amber-100' : 'text-zinc-100'}`}>Mint Daily Quote</p>
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-zinc-500 font-medium tracking-wide">+20 PTS</p>
                                {dailyQuoteCount > 0 && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 rounded">x{dailyQuoteCount}</span>}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setActiveTab(Tab.MINT)} className="px-4 py-2 bg-zinc-800 text-white text-sm font-bold rounded-xl hover:bg-zinc-700">
                        Go Mint
                    </button>
                 </div>

                 {/* 3. GENESIS BADGE */}
                 <div className={`flex items-center justify-between p-5 rounded-2xl border transition-all hover:bg-zinc-800/40 ${hasGenesisNFT ? 'bg-purple-950/20 border-purple-500/30' : 'bg-zinc-900/40 border-zinc-800'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${hasGenesisNFT ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            <Trophy size={24} className={hasGenesisNFT ? 'fill-current' : ''} />
                        </div>
                        <div>
                            <p className={`font-bold text-lg ${hasGenesisNFT ? 'text-purple-100' : 'text-zinc-100'}`}>Genesis Badge</p>
                            <p className="text-xs text-zinc-500 font-medium tracking-wide">+500 PTS</p>
                        </div>
                    </div>
                    {hasGenesisNFT ? <CheckCircle2 size={24} className="text-purple-500" /> : 
                        <button onClick={() => setActiveTab(Tab.MINT)} className="px-4 py-2 bg-zinc-800 text-white text-sm font-bold rounded-xl hover:bg-zinc-700">Go Mint</button>
                    }
                 </div>

              </div>
            </div>
          )}
        </main>
      </div>

      {/* FOOTER */}
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