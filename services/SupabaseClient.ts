import { createClient } from '@supabase/supabase-js';
import { FarcasterUser } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);


export const getLeaderboard = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('score', { ascending: false })
    .limit(50);
  
  if (error) console.error('Error fetching leaderboard:', error);
  return data || [];
};


export const getUserScore = async (fid: number) => {
    const { data, error } = await supabase
      .from('users')
      .select('score')
      .eq('fid', fid)
      .single();
    
    if (error) return 0;
    return data?.score || 0;
};

export const updateUserScore = async (user: FarcasterUser, pointsToAdd: number) => {

    const currentScore = await getUserScore(user.fid);
    const newScore = currentScore + pointsToAdd;


    const { error } = await supabase
        .from('users')
        .upsert({
            fid: user.fid,
            username: user.username,
            display_name: user.displayName,
            pfp_url: user.pfpUrl,
            score: newScore,
            last_active: new Date().toISOString()
        });

    if (error) console.error('Error updating score:', error);
    return newScore;
};