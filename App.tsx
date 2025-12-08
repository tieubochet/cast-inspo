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
const CHAIN_ID = 8453; // Base Mainnet

// Public Client to read contract state without prompting user
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

const CONTRACT_ABI = parseAbi([
  "function checkInAndClaim() external",
  "function getCurrentDay() public view returns (uint256)",
  "function lastClaimDay(address) public view returns (uint256)"
]);

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
          abi: CONTRACT_ABI,
          functionName: 'getCurrentDay'
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'lastClaimDay',
          args: [address as `0x${string}`]
        })
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

  const fetchNewQuote = async () => {
    setLoading(true);
    try {
      const quote = await generateQuote();
      setCurrentQuote(quote);
    } catch (error) {
      console.error("Failed to fetch quote", error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!currentQuote) return;
    
    // Logic: If already claimed, tell them and DO NOT unlock the button.
    if (hasClaimedToday) {
      // You can decide whether to block sharing or just not unlock the button.
      // Here we let them share but we don't enable the claim button.
      console.log("User shared, but has already claimed today.");
    } else {
      // Unlock the Claim button immediately upon sharing trigger
      setCanClaim(true);
    }
    
    const shareText = `“${currentQuote.text}”\n- ${currentQuote.author}`;
    const encodedText = encodeURIComponent(`${shareText}\n\nVia CastInspo`);
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodedText}`;

    // 1. Try Native Share (Best for sharing the actual IMAGE to Warpcast on Mobile)
    if (currentQuote.imageUrl && navigator.share) {
      try {
        const response = await fetch(currentQuote.imageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'daily-quote.png', { type: 'image/png' });
        
        const shareData = {
          files: [file],
          title: 'CastInspo',
          text: shareText,
        };

        // Check if the device supports sharing files
        if (navigator.canShare && navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return; // Success
        }
      } catch (err) {
        console.warn("Native share failed or was cancelled, attempting fallback...", err);
        // Fall through to fallback
      }
    }

    // 2. Fallback: Farcaster SDK (Opens Warpcast Compose with TEXT only)
    try {
      sdk.actions.openUrl(warpcastUrl);
    } catch (sdkErr) {
      console.warn("SDK openUrl failed, attempting window.open...", sdkErr);
      // 3. Ultimate Fallback: Standard Web Link
      window.open(warpcastUrl, '_blank');
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
        abi: CONTRACT_ABI,
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
      
      alert(`Claim submitted successfully! Hash: ${txHash}`);
      
      // Update status immediately assuming success (optimistic UI), 
      // or wait a bit. Ideally we wait for receipt, but simpler here:
      setHasClaimedToday(true);
      setCanClaim(false);

      // Optionally re-verify from chain after a delay
      setTimeout(() => {
        if (userAddress) checkClaimStatus(userAddress);
      }, 5000);

    } catch (error: any) {
      console.error("Claim failed:", error);
      if (error.message?.includes('reverted') || error.code === 3 || error.message?.includes('execution reverted')) {
         alert("Transaction failed: Execution reverted. You may have already claimed today, or the contract is out of funds.");
         // Re-check status in case we missed it
         if (userAddress) checkClaimStatus(userAddress);
      } else if (error.code === 4001) {
         alert("Transaction rejected by user.");
      } else {
         alert(`Failed to claim: ${error.message || "Unknown error"}`);
      }
    } finally {
      setIsClaiming(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchNewQuote();
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
                onNewQuote={fetchNewQuote}
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