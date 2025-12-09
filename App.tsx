
import React, { useState, useEffect, useCallback } from 'react';
import sdk from '@farcaster/frame-sdk';
import { encodeFunctionData, createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import Header from './components/Header';
import QuoteCard from './components/QuoteCard';
import Footer from './components/Footer';
import { generateQuote } from './services/Service';
import { Quote, Tab, FarcasterUser } from './types';

const CONTRACT_ADDRESS = "0x99952E86dD355D77fc19EBc167ac93C4514BA7CB" as const;
const MINI_APP_URL = "https://farcaster.xyz/miniapps/S9xDZOSiOGWl/castinspo";

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
      
      // If we loaded a specific quote, ensure we clear the URL param so 'New Quote' works as expected visually? 
      // Actually, 'New Quote' calls this without args, so it works fine.
    } catch (error) {
      console.error("Failed to fetch quote", error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!currentQuote || !currentQuote.imageUrl) return;
    
    // Unlock claim logic immediately to allow "Share to Claim" flow
    if (!hasClaimedToday) {
      setCanClaim(true);
    }

    const appUrl = `${MINI_APP_URL}?q=${currentQuote.id}`;
    const shareText = `“${currentQuote.text}”\n\nCheck out CastInspo: ${appUrl}`;
    
    let fileShared = false;

    // 1. Prepare File
    const blob = dataURItoBlob(currentQuote.imageUrl);
    const file = new File([blob], 'quote.png', { type: 'image/png' });

    // 2. Attempt Native Share (Mobile)
    // We try/catch this because navigator.share support varies wildly in WebViews
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          text: shareText
        });
        fileShared = true;
      } catch (err) {
        console.warn("Native share failed:", err);
      }
    }

    // 3. Fallback: Download & Open URL (Desktop or if Native Share failed)
    if (!fileShared) {
      try {
        // Auto-download the image
        const link = document.createElement('a');
        link.href = currentQuote.imageUrl;
        link.download = `castinspo-${currentQuote.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Small delay to ensure download starts before context switch
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error("Auto-download failed:", e);
      }

      // Open Warpcast Composer
      // We pass the text. User can attach the downloaded image manually.
      const encodedText = encodeURIComponent(shareText);
      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodedText}`;

      try {
        await sdk.actions.openUrl(warpcastUrl);
      } catch (e) {
        console.error("Failed to open Warpcast URL", e);
      }
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

      // Re-check status after a delay
      setTimeout(() => {
        if (userAddress) checkClaimStatus(userAddress);
      }, 5000);

    } catch (error: any) {
      console.error("Claim failed:", error);
      if (error.message?.includes('reverted') || error.code === 3 || error.message?.includes('execution reverted')) {
         alert("Transaction failed: Execution reverted. You may have already claimed today, or the contract is out of funds.");
         if (userAddress) checkClaimStatus(userAddress);
      } else if (error.code === 4001) {
         // User rejected
      } else {
         alert(`Failed to claim: ${error.message || "Unknown error"}`);
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
                <p className="text-zinc-300 mb-6">Turn your favorite quotes into collectibles.</p>
                <button className="bg-zinc-700/50 text-zinc-400 px-6 py-3 rounded-full cursor-not-allowed w-full border border-zinc-600/50">Coming Soon</button>
              </div>
            </div>
          )}

          {activeTab === Tab.REWARD && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center w-full">
               <div className="p-6 bg-zinc-800/40 backdrop-blur-md rounded-2xl border border-zinc-700/50 w-full shadow-lg">
                <h2 className="text-2xl font-bold mb-2 text-orange-400">Rewards System</h2>
                <p className="text-zinc-300 mb-6">Earn points and unlock exclusive features.</p>
                <button className="bg-zinc-700/50 text-zinc-400 px-6 py-3 rounded-full cursor-not-allowed w-full border border-zinc-600/50">Coming Soon</button>
              </div>
            </div>
          )}
        </main>
        
        <Footer activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>
    </div>
  );
};

export default App;
