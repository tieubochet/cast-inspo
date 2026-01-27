import React, { useState, useEffect, useCallback, useRef } from 'react';
import sdk, { type Context } from '@farcaster/frame-sdk';
import { 
  getDailyQuote, 
  getQuoteById, 
  uploadQuoteImageToImgBB,
  generateSharingLink 
} from './services/Service'; // Đảm bảo bạn đã update Service.ts như bước trước
import { Quote, FarcasterUser, Tab } from './types';
import QuoteCard from './components/QuoteCard';
import Header from './components/Header';
import Footer from './components/Footer';
import ClaimSuccessModal from './components/ClaimSuccessModal';
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { Toaster, toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0xcB517c1Ba4587a5192eB8D4f45e1f8617a47a90c"; 
const NFT_CONTRACT_ADDRESS = "0x831e3158f427eb74a7b02Fa40E40daA1a9111568" as const; // Thay địa chỉ contract NFT của bạn vào đây
const CHAIN_ID = 8453; 
const RPC_URL = "https://mainnet.base.org";

// --- ABI DEFINITIONS ---
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
  // User & Wallet State
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  
  // App State
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME); // State quản lý Tab
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  
  // Claim Rewards State
  const [canClaim, setCanClaim] = useState<boolean>(false); // Kiểm soát nút Claim (Gray/Gold)
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [hasClaimedToday, setHasClaimedToday] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  
  // NFT Mint State
  const [nftSupply, setNftSupply] = useState<number>(0);
  const [hasMintedNFT, setHasMintedNFT] = useState<boolean>(false);
  const [isMintingNFT, setIsMintingNFT] = useState<boolean>(false);

  const toastIdRef = useRef<string | number | null>(null);

  // --- Helpers ---
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

  // --- Data Fetching ---
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
      
      // Nếu đã claim rồi thì disable nút claim, nếu chưa thì chờ user share mới enable
      if (isClaimed) {
          setCanClaim(false); 
      }
    } catch (error) {
      console.error("Failed to check claim status:", error);
    }
  }, []);

  const checkNftStatus = useCallback(async (address: string) => {
    if (NFT_CONTRACT_ADDRESS === "0x831e3158f427eb74a7b02Fa40E40daA1a9111568") return;
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

  // --- Initialization ---
  useEffect(() => {
    const initSDK = async () => {
      try {
        const context: Context = await sdk.context;
        if (context.user) {
          setUser({ fid: context.user.fid, username: context.user.username, pfpUrl: context.user.pfpUrl });
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

  // --- Actions ---

  // 1. Handle Share -> Unlock Claim
  const handleShare = async () => {
    if (!currentQuote) return;
    
    // LOGIC QUAN TRỌNG: Mở khóa nút Claim ngay khi bấm Share (nếu chưa claim)
    if (!hasClaimedToday) {
        setCanClaim(true); 
    }

    setIsSharing(true);
    showToast("Generating image...", "loading");

    try {
        // Upload ảnh lên ImgBB (dùng hàm từ Service.ts mới)
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
        console.error("Share error:", error);
        showToast("Error preparing share.", "error");
    } finally {
        setIsSharing(false);
    }
  };

  // 2. Handle Claim Reward
  const handleClaim = async () => {
    if (!userAddress) return showToast("Connect wallet first", "error");
    
    setIsClaiming(true);
    showToast("Claiming reward...", "loading", 0);

    try {
      const isBase = await checkChainId();
      if (!isBase) {
         await sdk.wallet.ethProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] });
      }

      const hash = await sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{ to: CONTRACT_ADDRESS, from: userAddress, data: encodeFunctionData({ abi: CLAIM_ABI, functionName: "checkInAndClaim" }) }]
      });

      setClaimTxHash(hash as string);
      setHasClaimedToday(true);
      setCanClaim(false); // Disable nút sau khi claim
      setShowSuccessModal(true);
      showToast("Claimed successfully!", "success");

    } catch (error: any) {
      console.error("Claim failed:", error);
      if (error.message?.includes("reverted")) {
         showToast("Transaction failed or already claimed.", "error");
         setHasClaimedToday(true); // Giả định lỗi do đã claim
      } else {
         showToast("Claim failed.", "error");
      }
    } finally {
      setIsClaiming(false);
    }
  };

  // 3. Handle Mint NFT
  const handleMint = async () => {
    if (!userAddress) return showToast("Connect wallet first", "error");
    if (NFT_CONTRACT_ADDRESS === "0x831e3158f427eb74a7b02Fa40E40daA1a9111568") return showToast("Contract not setup", "error");

    setIsMintingNFT(true);
    showToast("Minting NFT...", "loading", 0);

    try {
      const isBase = await checkChainId();
      if (!isBase) {
         await sdk.wallet.ethProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] });
      }

      const hash = await sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{ to: NFT_CONTRACT_ADDRESS, from: userAddress, data: encodeFunctionData({ abi: NFT_ABI, functionName: "mint" }) }]
      });

      showToast("Minted successfully!", "success");
      setHasMintedNFT(true);
      setNftSupply(prev => prev + 1);
    } catch (error: any) {
      console.error("Mint failed:", error);
      showToast("Mint failed.", "error");
    } finally {
      setIsMintingNFT(false);
    }
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col relative overflow-hidden font-sans selection:bg-purple-500/30">
      <Toaster position="top-center" theme="dark" toastOptions={{ style: { background: 'rgba(39, 39, 42, 0.9)', border: '1px solid #3f3f46' } }}/>

      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] bg-purple-900/20 rounded-full blur-[120px] animate-blob"></div>
          <div className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[70%] bg-blue-900/20 rounded-full blur-[120px] animate-blob delay-2000"></div>
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]"></div>
      </div>

      <div className="relative z-10 flex flex-col flex-grow h-full w-full max-w-[393px] mx-auto pb-[80px]"> {/* Thêm padding bottom để tránh Footer che nội dung */}
        
        <Header 
          user={user} 
          onClaim={handleClaim} 
          isClaiming={isClaiming} 
          canClaim={canClaim} // Truyền state canClaim xuống Header
          hasClaimedToday={hasClaimedToday}
        />

        <main className="flex-grow flex flex-col items-center w-full px-4 mt-4">
          
          {/* --- HOME TAB --- */}
          {activeTab === Tab.HOME && (
              <QuoteCard
                quote={currentQuote}
                loading={isLoading} // Fix prop name: loading (dựa theo QuoteCard.tsx của bạn)
                onNewQuote={() => fetchQuote()}
                onShare={handleShare}
              />
          )}

          {/* --- MINT TAB --- */}
          {activeTab === Tab.MINT && (
            <div className="flex flex-col items-center justify-start pt-4 h-full w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="relative group w-full max-w-[300px] aspect-square mb-6 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
                 <img src="/nft-preview.png" alt="NFT" className="w-full h-full object-cover" 
                      onError={(e) => (e.target as HTMLImageElement).src = 'https://placehold.co/600x600/27272a/FFFFFF/png?text=NFT'} />
                 <div className="absolute bottom-3 right-3 px-3 py-1 bg-black/70 backdrop-blur rounded-full text-xs text-white border border-white/20">
                    {nftSupply}/100 Minted
                 </div>
               </div>
               
               <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400 mb-4">Genesis Badge</h2>
               
               <button 
                  onClick={handleMint}
                  disabled={isMintingNFT || hasMintedNFT || nftSupply >= 100}
                  className={`w-full max-w-[300px] py-3.5 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2
                    ${hasMintedNFT ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:scale-[1.02]'}`}
               >
                  {isMintingNFT ? <Loader2 className="animate-spin" /> : hasMintedNFT ? <CheckCircle2 /> : "Mint Free"}
                  {isMintingNFT ? "Minting..." : hasMintedNFT ? "Owned" : ""}
               </button>
            </div>
          )}

          {/* --- REWARD TAB --- */}
          {activeTab === Tab.REWARD && (
            <div className="flex flex-col items-center justify-center h-[50vh] text-zinc-500 animate-in fade-in zoom-in">
              <p className="text-xl font-bold text-zinc-300">Rewards</p>
              <p className="text-sm">Coming soon.</p>
            </div>
          )}
        </main>

        {/* FIX LỖI FOOTER: Dùng đúng prop setActiveTab */}
        <Footer activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      <ClaimSuccessModal 
        isOpen={showSuccessModal} 
        onClose={() => setShowSuccessModal(false)}
        onShare={() => sdk.actions.openUrl(`https://warpcast.com/~/compose?text=I%20just%20claimed%20rewards!`)}
      />
    </div>
  );
};

export default App;