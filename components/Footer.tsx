import React from 'react';
import { Home, Hammer, Gift } from 'lucide-react';
import { Tab } from '../types';

interface FooterProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const Footer: React.FC<FooterProps> = ({ activeTab, setActiveTab }) => {
  const getTabClass = (tab: Tab) => {
    return `flex flex-col items-center gap-1 p-2 transition-all duration-300 ${
      activeTab === tab ? 'text-zinc-100 scale-105' : 'text-zinc-600 hover:text-zinc-400'
    }`;
  };

  return (
    <div className="absolute bottom-0 w-full bg-zinc-900/90 backdrop-blur-xl border-t border-zinc-800 pb-safe z-50">
      <div className="flex justify-around items-center py-3 px-2">
        <button 
          className={getTabClass(Tab.HOME)}
          onClick={() => setActiveTab(Tab.HOME)}
        >
          <Home size={22} strokeWidth={activeTab === Tab.HOME ? 2.5 : 2} />
          <span className="text-[10px] font-medium tracking-wide">Home</span>
        </button>

        <button 
          className={getTabClass(Tab.MINT)}
          onClick={() => setActiveTab(Tab.MINT)}
        >
          <Hammer size={22} strokeWidth={activeTab === Tab.MINT ? 2.5 : 2} />
          <span className="text-[10px] font-medium tracking-wide">Mint</span>
        </button>

        <button 
          className={getTabClass(Tab.REWARD)}
          onClick={() => setActiveTab(Tab.REWARD)}
        >
          <Gift size={22} strokeWidth={activeTab === Tab.REWARD ? 2.5 : 2} />
          <span className="text-[10px] font-medium tracking-wide">Reward</span>
        </button>
      </div>
    </div>
  );
};

export default Footer;