export interface Quote {
  id: number;
  text: string;
  author: string;
  imageUrl?: string;
}

export enum Tab {
  HOME = 'HOME',
  MINT = 'MINT',
  REWARD = 'REWARD'
}

export interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

export interface QuoteTheme {
  id: string;
  name: string;
  bg: string[]; 
  text: string;
  accent: string;
}