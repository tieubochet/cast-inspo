import { Quote } from "../types";
import quotesData from "../quotes.json";

// Lấy API Key từ biến môi trường
const IMGBB_API_KEY = (import.meta as any).env.VITE_IMGBB_API_KEY;

/**
 * Hàm vẽ ảnh Quote (Canvas Logic)
 * Giữ nguyên logic vẽ ảnh đẹp của bạn
 */
const createQuoteImage = (text: string, author: string): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const width = 600;
    const height = 400;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      resolve('');
      return;
    }

    // --- Background ---
    ctx.fillStyle = '#6A3CFF'; // Deep Purple
    ctx.fillRect(0, 0, width, height);

    // --- Icon ---
    const iconY = 45; 
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(width / 2, iconY, 20, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#6A3CFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('“', width / 2, iconY + 12);

    // --- Text Calculation ---
    const paddingX = width * 0.13;
    const paddingY = height * 0.15;
    const safeHeight = height - (paddingY * 2);
    const maxWidth = width - (paddingX * 2); 
    
    const fontFamily = "'Arsenal', sans-serif";
    const authorFontFamily = "'Quicksand', sans-serif";
    
    let fontSize = 36;
    let lineHeight = fontSize * 1.35;
    let authorFontSize = Math.max(14, fontSize * 0.60);
    let lines: string[] = [];
    let fits = false;

    // Loop to find fitting font size
    while (fontSize > 10) {
      ctx.font = `italic ${fontSize}px ${fontFamily}`;
      lineHeight = fontSize * 1.35;
      authorFontSize = Math.max(14, fontSize * 0.60);

      const words = text.split(' ');
      let line = '';
      lines = [];

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          lines.push(line);
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line);

      const totalHeight = (lines.length * lineHeight) + 20 + authorFontSize;
      if (totalHeight <= safeHeight) {
        fits = true;
        break;
      }
      fontSize -= 2;
    }

    if (!fits) fontSize = 12;

    // --- Draw Content ---
    const totalContentHeight = (lines.length * lineHeight) + 20 + authorFontSize;
    const blockTopY = (height / 2) - (totalContentHeight / 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = `italic ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], width / 2, blockTopY + (i * lineHeight) + (lineHeight / 2));
    }

    // --- Draw Author ---
    const authorY = blockTopY + (lines.length * lineHeight) + 20 + (authorFontSize / 2);
    ctx.fillStyle = '#FCD34D'; // Gold
    ctx.font = `bold ${authorFontSize}px ${authorFontFamily}`;
    ctx.fillText(`- ${author}`, width / 2, authorY);

    resolve(canvas.toDataURL('image/png'));
  });
};

/**
 * EXPORT 1: Lấy Quote ngẫu nhiên (Daily Quote)
 */
export const getDailyQuote = async (): Promise<Quote> => {
  const index = Math.floor(Math.random() * quotesData.length);
  return generateQuoteByIndex(index);
};

/**
 * EXPORT 2: Lấy Quote theo ID cụ thể
 */
export const getQuoteById = async (id: string | number): Promise<Quote> => {
  let index = Number(id);
  // Nếu ID không hợp lệ, fallback về random
  if (isNaN(index) || index < 0 || index >= quotesData.length) {
    return getDailyQuote();
  }
  return generateQuoteByIndex(index);
};

// Hàm nội bộ để tái sử dụng logic
const generateQuoteByIndex = async (index: number): Promise<Quote> => {
  const rawQuote = quotesData[index];
  let imageUrl: string | undefined;
  
  try {
    imageUrl = await createQuoteImage(rawQuote.content, rawQuote.author);
  } catch (e) {
    console.error("Failed to generate image", e);
  }

  return {
    id: index,
    text: rawQuote.content,
    author: rawQuote.author,
    imageUrl
  };
};

/**
 * EXPORT 3: Upload ảnh lên ImgBB
 */
export const uploadQuoteImageToImgBB = async (quote: Quote): Promise<string> => {
    if (!quote.imageUrl) throw new Error("No image to upload");
    
    // 1. Convert Data URL to Blob
    const base64Response = await fetch(quote.imageUrl);
    const blob = await base64Response.blob();

    if (!IMGBB_API_KEY) {
        console.warn("Missing ImgBB API Key");
        throw new Error("Missing ImgBB API Key");
    }

    // 2. Prepare FormData
    const formData = new FormData();
    formData.append("image", blob);

    // 3. Upload
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: formData,
    });

    const data = await response.json();
    if (data.success) {
        return data.data.url;
    } else {
        throw new Error(data.error?.message || "ImgBB Upload Failed");
    }
};

/**
 * EXPORT 4: Tạo link chia sẻ Warpcast
 */
export const generateSharingLink = (quoteId: number, imageUrl?: string): string => {
    // Link tới Mini App của bạn (quan trọng để giữ context frame)
    // Bạn có thể thay đổi domain nếu cần, nhưng window.location.origin thường an toàn
    const appUrl = `https://cast-inspo.vercel.app/?quoteId=${quoteId}`; 
    
    const text = "Daily inspiration ✨ Minted via CastInspo";
    
    // Tạo Deep Link Warpcast Composer
    // Embed 1: App URL (để hiện nút Launch Frame)
    // Embed 2: Ảnh Quote (để hiện ảnh preview to đẹp)
    let link = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(appUrl)}`;
    
    if (imageUrl) {
        link += `&embeds[]=${encodeURIComponent(imageUrl)}`;
    }
    
    return link;
};

// Giữ lại hàm cũ để tương thích ngược nếu cần (không bắt buộc nếu App.tsx không dùng)
export const generateQuote = async (index?: number) => {
    if (index !== undefined) return getQuoteById(index);
    return getDailyQuote();
}