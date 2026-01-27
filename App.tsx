import React, { useEffect, useState, useRef, useCallback } from 'react';
import sdk, { type Context } from '@farcaster/frame-sdk';
import { 
  generateSharingLink, 
  getDailyQuote, 
  getQuoteById, 
  uploadQuoteImageToImgBB 
} from './services/Service';
import { Quote, FarcasterUser, Tab } from './types';
import QuoteCard from './components/QuoteCard';
import Header from './components/Header';
import Footer from './components/Footer';
import ClaimSuccessModal from './components/ClaimSuccessModal';
import { createPublicClient, http, parseAbi, encodeFunctionData, formatEther } from 'viem';
import { base } from 'viem/chains';
import { Toaster, toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0xcB517c1Ba4587a5192eB8D4f45e1f8617a47a90c"; // Existing Daily Reward Contract
const CHAIN_ID = 8453; // Base Mainnet
const RPC_URL = "https://mainnet.base.org";

// --- NEW: NFT CONTRACT CONFIG ---
// TODO: THAY ĐỊA CHỈ CONTRACT NFT CỦA BẠN VÀO ĐÂY SAU KHI DEPLOY
const NFT_CONTRACT_ADDRESS = "0x831e3158f427eb74a7b02Fa40E40daA1a9111568" as const; 

const ABI = parseAbi([
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
// ---------------------

const App: React.FC = () => {
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  
  // Reward States
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [hasClaimedToday, setHasClaimedToday] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  
  // NFT Mint States
  const [nftSupply, setNftSupply] = useState<number>(0);
  const [hasMintedNFT, setHasMintedNFT] = useState<boolean>(false);
  const [isMintingNFT, setIsMintingNFT] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const toastIdRef = useRef<string | number | null>(null);

  // --- Helper: Show Toast ---
  const showToast = (message: string, type: 'loading' | 'success' | 'error', duration?: number) => {
    if (toastIdRef.current) toast.dismiss(toastIdRef.current);
    const toastFn = type === 'loading' ? toast.loading : type === 'success' ? toast.success : toast.error;
    toastIdRef.current = toastFn(message, { duration });
  };

  // --- Helper: Check Chain ID ---
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

  // --- Function: Fetch Quote ---
  const fetchQuote = useCallback(async (quoteId?: string) => {
    setIsLoading(true);
    try {
        let quote: Quote;
        if (quoteId) {
            quote = await getQuoteById(quoteId);
        } else {
            quote = await getDailyQuote();
        }
        setCurrentQuote(quote);
    } catch (error) {
        console.error("Error fetching quote:", error);
        showToast("Failed to load quote. Please try again.", "error");
    } finally {
        setIsLoading(false);
    }
  }, []);

  // --- Function: Check Daily Reward Status ---
  const checkClaimStatus = useCallback(async (address: string) => {
    try {
      const [currentDayStr, lastClaimDayStr] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'getCurrentDay'
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'lastClaimDay',
          args: [address as `0x${string}`]
        })
      ]);

      const currentDay = Number(currentDayStr);
      const lastClaimDay = Number(lastClaimDayStr);
      setHasClaimedToday(lastClaimDay === currentDay);
    } catch (error) {
      console.error("Failed to check claim status:", error);
    }
  }, []);

  // --- NEW FUNCTION: Check NFT Status ---
  const checkNftStatus = useCallback(async (address: string) => {
    if (NFT_CONTRACT_ADDRESS === "0x831e3158f427eb74a7b02Fa40E40daA1a9111568") {
        console.warn("NFT Contract address not set yet.");
        return;
    }
    try {
      const [supply, balance] = await Promise.all([
        publicClient.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: NFT_ABI,
          functionName: 'totalSupply'
        }) as Promise<bigint>,
        publicClient.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: NFT_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`]
        }) as Promise<bigint>
      ]);

      setNftSupply(Number(supply));
      setHasMintedNFT(Number(balance) > 0);
    } catch (error) {
      console.error("Failed to check NFT status:", error);
    }
  }, []);

  // --- Init SDK & Load Data ---
  useEffect(() => {
    const initSDK = async () => {
      try {
        const context: Context = await sdk.context;
        if (context.user) {
          setUser({
            fid: context.user.fid,
            username: context.user.username,
            pfpUrl: context.user.pfpUrl,
          });
        }

        // Connect Wallet & Check Statuses
        if (sdk.wallet && sdk.wallet.ethProvider) {
           try {
             const accounts = await sdk.wallet.ethProvider.request({ method: 'eth_requestAccounts' }) as string[];
             if (accounts && accounts.length > 0) {
               const address = accounts[0];
               setUserAddress(address);
               checkClaimStatus(address);
               checkNftStatus(address); // Check NFT status on load
             }
           } catch (walletErr) {
             console.error("Error connecting wallet:", walletErr);
           }
        }

        // Handle Deep Link parameters for Quotes
        const params = new URLSearchParams(window.location.search);
        const quoteIdParam = params.get('quoteId');
        await fetchQuote(quoteIdParam || undefined);
        
        sdk.actions.ready();
      } catch (error) {
        console.error("Error initializing Farcaster SDK:", error);
        setIsLoading(false);
      }
    };
    initSDK();
  }, [fetchQuote, checkClaimStatus, checkNftStatus]);

  // --- Handle Daily Claim ---
  const handleClaim = async () => {
    if (!userAddress) {
        showToast("Wallet not connected. Please try again in a moment.", "error");
        return;
    }
    if (!sdk.wallet.ethProvider) {
         showToast("Warpcast wallet provider not found.", "error");
         return;
    }

    setIsClaiming(true);
    showToast("Preparing transaction...", "loading", 0);

    try {
      const isBase = await checkChainId();
      if (!isBase) {
        try {
             await sdk.wallet.ethProvider.request({
                 method: 'wallet_switchEthereumChain',
                 params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
             });
         } catch (switchError) {
             console.error("Failed to switch chain:", switchError);
             showToast("Please switch to Base network to claim.", "error");
             setIsClaiming(false);
             return;
         }
      }

      const calldata = encodeFunctionData({
        abi: ABI,
        functionName: "checkInAndClaim"
      });

      const txHash = await sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          to: CONTRACT_ADDRESS,
          from: userAddress,
          data: calldata,
        }]
      });

      console.log("Transaction Hash:", txHash);
      setClaimTxHash(txHash as string);
      setShowSuccessModal(true);
      setHasClaimedToday(true);

    } catch (error: any) {
      console.error("Claim error:", error);
      if (error.message?.includes("reverted")) {
         if (error.message.includes("already claimed")) {
              showToast("You have already claimed today!", "error");
              setHasClaimedToday(true);
         } else {
             showToast("Transaction reverted. Details in console.", "error");
         }
      } else if (error.code === 4001) {
          showToast("Transaction rejected by user.", "error");
      }
      else {
        showToast("Failed to send transaction. Please try again.", "error");
      }
    } finally {
      setIsClaiming(false);
      if (toastIdRef.current) toast.dismiss(toastIdRef.current);
    }
  };

  // --- NEW FUNCTION: Handle NFT Mint ---
  const handleMint = async () => {
    if (NFT_CONTRACT_ADDRESS === "0x831e3158f427eb74a7b02Fa40E40daA1a9111568") {
      showToast("Contract not configured yet.", "error");
      return;
    }
    if (!userAddress) {
      showToast("Please check wallet connection.", "error");
      return;
    }
    if (hasMintedNFT) {
      showToast("You already own this NFT!", "error");
      return;
    }
    if (nftSupply >= 100) {
      showToast("Sorry, sold out!", "error");
      return;
    }

    setIsMintingNFT(true);
    showToast("Minting NFT...", "loading", 0);

    try {
      const calldata = encodeFunctionData({
        abi: NFT_ABI,
        functionName: "mint"
      });

      // Ensure on Base chain
      const isBase = await checkChainId();
      if (!isBase) {
        await sdk.wallet.ethProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
        });
      }

      const txHash = await sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          to: NFT_CONTRACT_ADDRESS,
          from: userAddress,
          data: calldata,
        }]
      });

      console.log("Mint Tx:", txHash);
      showToast("Mint successful! Welcome to the club.", "success");
      
      // Optimistic update
      setHasMintedNFT(true);
      setNftSupply(prev => prev + 1);

    } catch (error: any) {
      console.error("Mint failed:", error);
      if (error.message?.includes('MaxSupplyReached')) {
        showToast("Sold out right before you!", "error");
        setNftSupply(100);
      } else if (error.message?.includes('AlreadyMinted')) {
        showToast("You already minted one!", "error");
        setHasMintedNFT(true);
      } else if (error.code === 4001) {
        showToast("Mint cancelled.", "error");
      } else {
        showToast("Mint failed. Try again.", "error");
      }
    } finally {
      setIsMintingNFT(false);
    }
  };


  // --- Handle Share Quote ---
  const handleShare = async () => {
    if (!currentQuote) return;
    setIsSharing(true);
    showToast("Generating image...", "loading");
    try {
        const imageUrl = await uploadQuoteImageToImgBB(currentQuote);
        const shareLink = generateSharingLink(currentQuote.id, imageUrl);
        
        if (toastIdRef.current) toast.dismiss(toastIdRef.current);
        sdk.actions.openUrl(shareLink);
    } catch (error) {
        console.error("Share error:", error);
        showToast("Could not upload image. Sharing text only.", "error");
        const shareLink = generateSharingLink(currentQuote.id);
        sdk.actions.openUrl(shareLink);
    } finally {
        setIsSharing(false);
    }
  };

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col relative overflow-hidden font-sans selection:bg-purple-500/30">
      <Toaster position="top-center" theme="dark" toastOptions={{
        style: { background: 'rgba(39, 39, 42, 0.8)', backdropFilter: 'blur(12px)', border: '1px solid rgba(63, 63, 70, 0.5)', color: 'white' }
      }}/>

      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] bg-purple-900/20 rounded-full blur-[120px] animate-blob mix-blend-screen"></div>
          <div className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[70%] bg-blue-900/20 rounded-full blur-[120px] animate-blob animation-delay-2000 mix-blend-screen"></div>
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 flex flex-col flex-grow h-full w-full max-w-[393px] mx-auto">
        <Header 
          user={user} 
          onClaim={handleClaim} 
          isClaiming={isClaiming} 
          hasClaimedToday={hasClaimedToday}
        />

        <main className="flex-grow flex flex-col items-center w-full px-4 mt-4 mb-20">
          
          {/* --- TAB HOME --- */}
          {activeTab === Tab.HOME && (
              <QuoteCard
              quote={currentQuote}
              isLoading={isLoading}
              isSharing={isSharing}
              onNewQuote={() => fetchQuote()}
              onShare={handleShare}
            />
          )}

          {/* --- TAB MINT (UPDATED) --- */}
          {activeTab === Tab.MINT && (
            <div className="flex flex-col items-center justify-start pt-4 h-full w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* NFT Preview Card */}
              <div className="relative group w-full max-w-[320px] aspect-square mb-8 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-zinc-900/50 backdrop-blur-xl">
                 {/* Glowing border effect */}
                 <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-blue-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-3xl blur-xl"></div>
                 
                 {/* Actual Image */}
                 <img 
                   src="/nft-preview.png" 
                   alt="CastInspo Genesis NFT" 
                   className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
                   onError={(e) => {
                     (e.target as HTMLImageElement).src = 'https://placehold.co/600x600/27272a/FFFFFF/png?text=Image+Not+Found';
                   }}
                 />
                 
                 {/* Supply Badge */}
                 <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-black/70 backdrop-blur-md border border-white/20 rounded-full text-xs font-medium text-white flex items-center gap-2 shadow-lg">
                    <div className={`w-2 h-2 rounded-full ${nftSupply >= 100 ? 'bg-red-500' : 'bg-green-500'} animate-pulse`}></div>
                    {nftSupply} / 100 Minted
                 </div>
              </div>

              {/* Mint Info & Action */}
              <div className="w-full max-w-[320px] text-center">
                  <h2 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400">
                    Genesis Badge
                  </h2>
                  <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                    Exclusive limited edition NFT for early CastInspo supporters. Only 100 will ever exist.
                  </p>

                  {NFT_CONTRACT_ADDRESS === "0x831e3158f427eb74a7b02Fa40E40daA1a9111568" ? (
                       <div className="p-4 bg-amber-900/30 border border-amber-700/50 rounded-xl text-amber-200 text-sm flex items-center gap-3">
                          <AlertCircle size={20} />
                          <span>Setup required: Contract address not configured in code.</span>
                       </div>
                  ) : (
                    <div className="space-y-4">
                        <button 
                            onClick={handleMint}
                            disabled={isMintingNFT || hasMintedNFT || nftSupply >= 100 || !userAddress}
                            className={`w-full py-4 rounded-2xl font-bold text-lg transition-all duration-300 shadow-lg flex items-center justify-center gap-3 relative overflow-hidden group
                            ${hasMintedNFT 
                                ? 'bg-zinc-800 text-zinc-400 cursor-default border border-zinc-700' 
                                : nftSupply >= 100
                                    ? 'bg-red-950/50 text-red-300 cursor-not-allowed border border-red-900/50'
                                    : !userAddress
                                        ? 'bg-zinc-800 text-zinc-500'
                                        : 'bg-white text-black hover:scale-[1.02] active:scale-[0.98]'
                            }`}
                        >
                            {isMintingNFT ? (
                                <>
                                    <Loader2 className="animate-spin" size={24} /> Minting...
                                </>
                            ) : hasMintedNFT ? (
                                <>
                                    <CheckCircle2 size={24} className="text-green-500" /> You Own It
                                </>
                            ) : nftSupply >= 100 ? (
                                "Sold Out"
                            ) : !userAddress ? (
                                "Connect Wallet to Mint"
                            ) : (
                                <>
                                  <span>Mint for Free</span>
                                  {/* Shine effect */}
                                  <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                                </>
                            )}
                        </button>
                        
                        {!hasMintedNFT && nftSupply < 100 && userAddress && (
                            <p className="text-xs text-zinc-500 font-medium">
                                Max 1 per wallet. Just pay gas fees (Base network).
                            </p>
                        )}
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* --- TAB REWARD --- */}
          {activeTab === Tab.REWARD && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-500 animate-in fade-in zoom-in duration-500">
              <p className="text-2xl font-bold mb-2 text-zinc-300">Rewards Program</p>
              <p className="text-sm">Coming soon. Stay tuned!</p>
            </div>
          )}
        </main>

        <Footer activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

       {/* Success Modal for Daily Claim */}
      <ClaimSuccessModal 
        isOpen={showSuccessModal} 
        onClose={() => setShowSuccessModal(false)}
        quote={currentQuote}
        txHash={claimTxHash || ""}
      />
    </div>
  );
};

export default App;