
import React, { useState, useEffect, useCallback } from 'react';
import sdk from '@farcaster/frame-sdk';
import { encodeFunctionData, createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import Header from './components/Header';
import QuoteCard from './components/QuoteCard';
import Footer from './components/Footer';
import ClaimSuccessModal from './components/ClaimSuccessModal';
import { generateQuote } from './services/Service';
import { Quote, Tab, FarcasterUser } from './types';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const CONTRACT_ADDRESS = "0x99952E86dD355D77fc19EBc167ac93C4514BA7CB" as const;
const MINI_APP_URL = "https://farcaster.xyz/miniapps/S9xDZOSiOGWl/castinspo";

// Get API Key from Environment Variable (Vercel)
const IMGBB_API_KEY = (import.meta as any).env.VITE_IMGBB_API_KEY;

// Public Client to read contract state without prompting user
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

// Using parseAbi for better type inference
const CLAIM_ABI = parseAbi([
  'function checkInAndClaim()'
]);

const VIEW_ABI = parseAbi([
  'function getCurrentDay() view returns (uint256)',
  'function lastClaimDay(address owner) view returns (uint256)'
]);

// Helper to convert Base64 Data URL to Blob for sharing
const dataURItoBlob = (dataURI: string) => {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
};

// Helper to upload image to ImgBB
const uploadToImgBB = async (imageBlob: Blob): Promise<string> => {
  if (!IMGBB_API_KEY) {
    throw new Error("ImgBB API Key is missing.");
  }

  const formData = new FormData();
  formData.append('image', imageBlob);
  // Optional: Set expiration to auto-delete after 1 week
  // formData.append('expiration', '604800'); 

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (data.success) {
    return data.data.url;
  } else {
    throw new Error('ImgBB Upload failed: ' + (data.error?.message || 'Unknown error'));
  }
};

// Simple Toast Component
const Toast = ({ message, type }: { message: string | null, type: 'loading' | 'success' | 'error' }) => {
  if (!message) return null;
  
  const bgClass = type === 'error' ? 'bg-red-500/90' : type === 'success' ? 'bg-emerald-500/90' : 'bg-zinc-800/90';
  const icon = type === 'loading' ? <Loader2 size={16} className="animate-spin" /> : type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />;

  return (
    <div className={`fixed bottom-24 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full backdrop-blur-md text-white text-sm font-medium shadow-xl flex items-center gap-2 z-[90] transition-all duration-300 ${bgClass}`}>
      {icon}
      <span>{message}</span>
    </div>
  );
};

const App: React.FC = () => {
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  
  // Rewards & Claiming State
  const [canClaim, setCanClaim] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [hasClaimedToday, setHasClaimedToday] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'loading' | 'success' | 'error'>('loading');

  const showToast = (msg: string, type: 'loading' | 'success' | 'error' = 'loading', duration = 3000) => {
    setToastMessage(msg);
    setToastType(type);
    if (duration > 0) {
      setTimeout(() => setToastMessage(null), duration);
    }
  };

  // Check if user has already claimed today
  const checkClaimStatus = useCallback(async (address: string) => {
    try {
      const [currentDay, lastClaim] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: VIEW_ABI,
          functionName: 'getCurrentDay'
        } as any),
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: VIEW_ABI,
          functionName: 'lastClaimDay',
          args: [address as `0x${string}`]
        } as any)
      ]);

      console.log(`Current Day: ${currentDay}, Last Claim: ${lastClaim}`);

      if (lastClaim === currentDay) {
        setHasClaimedToday(true);
        setCanClaim(false); // Ensure button is disabled if already claimed
      } else {
        setHasClaimedToday(false);
      }
    } catch (error) {
      console.error("Failed to check claim status:", error);
    }
  }, []);

  // Initialize Farcaster SDK and User Context
  useEffect(() => {
    const initSDK = async () => {
      try {
        const context = await sdk.context;
        
        // 1. Get User Profile
        if (context && context.user) {
          setUser({
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
            pfpUrl: context.user.pfpUrl,
          });
        }

        // 2. Get User Wallet Address via Provider
        if (sdk.wallet && sdk.wallet.ethProvider) {
           try {
             const accounts = await sdk.wallet.ethProvider.request({ method: 'eth_requestAccounts' }) as string[];
             if (accounts && accounts.length > 0) {
               const address = accounts[0];
               setUserAddress(address);
               console.log("Wallet connected:", address);
               
               // Check status immediately upon connection
               checkClaimStatus(address);
             }
           } catch (walletErr) {
             console.error("Error connecting wallet:", walletErr);
           }
        }
        
        // Notify Farcaster that the frame is ready
        sdk.actions.ready();
      } catch (error) {
        console.error("Error initializing Farcaster SDK:", error);
      }
    };

    initSDK();
  }, [checkClaimStatus]);

  const fetchNewQuote = async (index?: number) => {
    setLoading(true);
    try {
      // Pass the specific index (if exists) to the service
      const quote = await generateQuote(index);
      setCurrentQuote(quote);
    } catch (error) {
      console.error("Failed to fetch quote", error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!currentQuote || !currentQuote.imageUrl) return;

    // Unlock claim logic immediately
    if (!hasClaimedToday) {
      setCanClaim(true);
    }

    const appUrl = `${MINI_APP_URL}?q=${currentQuote.id}`;
    let publicImageUrl: string | null = null;

    try {
      if (IMGBB_API_KEY) {
        showToast("Uploading image...", "loading", 0);
        const blob = dataURItoBlob(currentQuote.imageUrl);
        publicImageUrl = await uploadToImgBB(blob);
        showToast("Opening Warpcast...", "success");
      } else {
        console.warn("No ImgBB API Key found.");
        showToast("Opening Warpcast (No Image)...", "success");
      }
    } catch (e: any) {
      console.error("Upload failed", e);
      showToast("Image upload failed. Sharing link only.", "error");
    }

    try {
      // 1. Construct Text
      // IMPORTANT: Do NOT include the URL in the text body if we are embedding it separately.
      // Including it in both places causes Warpcast mobile to disable the Cast button due to embed conflicts.
      let shareText = `Daily vibes via CastInspo ✨ Come for the inspiration, stay for the rewards!`;
      const suffix = ``; 
      
      // Truncate text to be safe (Farcaster limit ~320 bytes, keeping it under 280 chars to be safe)
      if (shareText.length > 280) {
        shareText = shareText.substring(0, 280) + "...";
      }
      shareText += suffix;

      const encodedText = encodeURIComponent(shareText);
      let warpcastUrl = `https://warpcast.com/~/compose?text=${encodedText}`;

      // 2. Explicitly Add Embeds
      // We explicitly embed 2 things:
      // 1. The Image URL (for the big preview)
      // 2. The Mini App URL (for the Frame button)
      // This is a valid 2-embed structure that Warpcast accepts.
      
      if (publicImageUrl) {
        warpcastUrl += `&embeds[]=${encodeURIComponent(publicImageUrl)}`;
      }
      
      // Always embed the App URL
      warpcastUrl += `&embeds[]=${encodeURIComponent(appUrl)}`;

      await sdk.actions.openUrl(warpcastUrl);
      setToastMessage(null); // Clear toast
    } catch (err) {
      console.error("Failed to open URL:", err);
      showToast("Failed to open Warpcast", "error");
    }
  };

  // Specific share handler for the Claim Rewards Success Modal
  const handleRewardShare = async () => {
    try {
      const text = `I just claimed 2k $teeboo_hl on CastInspo! 🎁 Check in daily to build your streak and earn rewards on Base.`;
      const encodedText = encodeURIComponent(text);
      // For reward share, we want the Frame preview, so we embed the URL
      const encodedEmbed = encodeURIComponent(MINI_APP_URL);
      
      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=${encodedEmbed}`;
      
      await sdk.actions.openUrl(warpcastUrl);
      setShowSuccessModal(false); // Close modal after sharing
    } catch (err) {
      console.error("Failed to open URL:", err);
    }
  };

  const checkChainId = async () => {
    if (!sdk.wallet.ethProvider) return false;
    try {
      const chainId = await sdk.wallet.ethProvider.request({ method: 'eth_chainId' });
      // 0x2105 is 8453 (Base)
      return chainId === '0x2105';
    } catch (e) {
      console.error("Error checking chain ID:", e);
      return false;
    }
  };

  const handleClaim = async () => {
    if (!userAddress) {
      alert("No wallet connected. Please open in Farcaster.");
      return;
    }

    if (hasClaimedToday) {
      return;
    }

    setIsClaiming(true);
    
    try {
      // 1. Encode the transaction data
      const calldata = encodeFunctionData({
        abi: CLAIM_ABI,
        functionName: "checkInAndClaim"
      });

      // 2. Check and Switch Chain to Base (8453)
      const isBase = await checkChainId();
      if (!isBase) {
        try {
          await sdk.wallet.ethProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x2105' }], // 8453 in hex
          });
        } catch (switchError) {
          console.error("Failed to switch chain:", switchError);
        }
      }

      // 3. Send transaction via Frame SDK Provider
      const txHash = await sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          to: CONTRACT_ADDRESS,
          from: userAddress,
          data: calldata,
        }]
      });
      
      console.log("Transaction sent:", txHash);
      
      // Optimistic UI update
      setHasClaimedToday(true);
      setCanClaim(false);

      showToast("Claimed successfully!", "success");
      
      // Show Success Modal
      setShowSuccessModal(true);

      // Re-check status after a delay
      setTimeout(() => {
        if (userAddress) checkClaimStatus(userAddress);
      }, 5000);

    } catch (error: any) {
      console.error("Claim failed:", error);
      if (error.message?.includes('reverted') || error.code === 3 || error.message?.includes('execution reverted')) {
         showToast("Transaction failed. Already claimed?", "error");
         if (userAddress) checkClaimStatus(userAddress);
      } else if (error.code === 4001) {
         // User rejected
      } else {
         showToast("Failed to claim", "error");
      }
    } finally {
      setIsClaiming(false);
    }
  };

  // Initial Load Logic: Check for URL params (?q=123)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const quoteParam = params.get('q');
    
    let specificIndex: number | undefined;

    if (quoteParam) {
      const parsedIndex = parseInt(quoteParam, 10);
      if (!isNaN(parsedIndex)) {
        specificIndex = parsedIndex;
      }
    }

    // Fetch the quote (either specific ID or random if undefined)
    fetchNewQuote(specificIndex);
  }, []);

  return (
    // Mobile container constraint
    <div className="w-full max-w-[393px] min-h-screen bg-zinc-950 text-slate-100 flex flex-col font-sans relative overflow-hidden shadow-2xl mx-auto">
      
      {/* Background Ambience - Colorful Moving Gradient & Blobs */}
      <div className="absolute inset-0 z-0">
        {/* Base animated gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-zinc-950 animate-gradient opacity-80"></div>

        {/* Moving Colorful Blobs */}
        <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[60%] bg-purple-600/30 rounded-full blur-[80px] animate-drift mix-blend-screen"></div>
        <div className="absolute top-[30%] right-[-20%] w-[80%] h-[70%] bg-blue-600/20 rounded-full blur-[90px] animate-drift-reverse delay-2000 mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] left-[10%] w-[70%] h-[60%] bg-emerald-600/20 rounded-full blur-[80px] animate-drift delay-5000 mix-blend-screen"></div>
        
        {/* Noise/Overlay for texture (optional, subtle) */}
        <div className="absolute inset-0 bg-zinc-950/20"></div>
      </div>

      <div className="relative z-10 flex flex-col h-full min-h-screen pb-20">
        <Header 
          user={user} 
          canClaim={canClaim}
          isClaiming={isClaiming}
          hasClaimedToday={hasClaimedToday}
          onClaim={handleClaim}
        />

        <main className="flex-grow flex flex-col items-center w-full px-4">
          {activeTab === Tab.HOME && (
            <>
              <div className="mt-4 mb-0 text-center z-20">
                <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-md font-serif">
                  CastInspo
                </h1>
                <p className="text-zinc-400 text-xs tracking-wide font-medium">
                  Quote. Share. Earn.
                </p>
              </div>
              <QuoteCard 
                quote={currentQuote} 
                loading={loading} 
                onNewQuote={() => fetchNewQuote()} // No arg = Random
                onShare={handleShare}
              />
            </>
          )}

          {activeTab === Tab.MINT && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center w-full">
              <div className="p-6 bg-zinc-800/40 backdrop-blur-md rounded-2xl border border-zinc-700/50 w-full shadow-lg">
                <h2 className="text-2xl font-bold mb-2 text-emerald-400">Mint Your Daily Quote</h2>
                <button className="bg-zinc-700/50 text-zinc-400 px-6 py-3 rounded-full cursor-not-allowed w-full border border-zinc-600/50">Coming Soon</button>
              </div>
            </div>
          )}

          {activeTab === Tab.REWARD && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center w-full">
               <div className="p-6 bg-zinc-800/40 backdrop-blur-md rounded-2xl border border-zinc-700/50 w-full shadow-lg">
                <h2 className="text-2xl font-bold mb-2 text-orange-400">Rewards System</h2>
                <button className="bg-zinc-700/50 text-zinc-400 px-6 py-3 rounded-full cursor-not-allowed w-full border border-zinc-600/50">Coming Soon</button>
              </div>
            </div>
          )}
        </main>
        
        <Footer activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      <ClaimSuccessModal 
        isOpen={showSuccessModal} 
        onClose={() => setShowSuccessModal(false)} 
        onShare={handleRewardShare}
      />

      <Toast message={toastMessage} type={toastType} />
    </div>
  );
};

export default App;
