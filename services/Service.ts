
import { Quote } from "../types";
import quotesData from "../quotes.json";

export const generateQuote = async (specificIndex?: number): Promise<Quote> => {
  // 1. Determine which quote to use
  // If specificIndex is provided and valid, use it. Otherwise, random.
  let index = specificIndex;
  
  if (index === undefined || index === null || isNaN(index) || index < 0 || index >= quotesData.length) {
    index = Math.floor(Math.random() * quotesData.length);
  }

  const rawQuote = quotesData[index];
  
  // 2. Generate an image for this quote
  let imageUrl: string | undefined = undefined;
  try {
    imageUrl = await createQuoteImage(rawQuote.content, rawQuote.author);
  } catch (e) {
    console.error("Failed to generate quote image", e);
  }

  return {
    id: index,
    text: rawQuote.content,
    author: rawQuote.author,
    imageUrl: imageUrl
  };
};

/**
 * Generates a standard Social Card image (1.91:1 Aspect Ratio - 1200x630)
 * This fits perfectly in Farcaster/Twitter feeds without cropping.
 */
const createQuoteImage = (text: string, author: string): Promise<string> => {
  return new Promise((resolve) => {
    // Create an off-screen canvas
    const canvas = document.createElement('canvas');
    // Standard OpenGraph Dimensions (1.91:1)
    const width = 1200;
    const height = 630;
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

    // --- Border (3px) ---
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(1.5, 1.5, width - 3, height - 3);

    // --- Decoration (Icon) ---
    // Moved up slightly due to shorter height
    const iconY = 100; 
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(width / 2, iconY, 40, 0, Math.PI * 2);
    ctx.fill();
    
    // Quote Icon inside circle
    ctx.fillStyle = '#6A3CFF';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('“', width / 2, iconY + 25);


    // --- Text Configuration ---
    const fontSize = 60; // Slightly smaller to fit 630px height better
    const lineHeight = 80;
    const fontFamily = "'Arsenal', sans-serif";
    const textColor = '#ffffff';
    
    ctx.fillStyle = textColor;
    ctx.font = `italic ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // --- Wrap Text Logic ---
    const maxWidth = width - 240; // More padding on sides
    const words = text.split(' ');
    let line = '';
    const lines = [];

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    // --- Draw Text Centered ---
    const totalTextHeight = lines.length * lineHeight;
    // Calculate startY based on new height
    // Center logic: (Height / 2) - (Block / 2) + offset for icon overlap
    let startY = (height / 2) - (totalTextHeight / 2) + 20;

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], width / 2, startY + (i * lineHeight));
    }

    // --- Author ---
    const authorY = startY + (lines.length * lineHeight) + 40;
    ctx.fillStyle = '#FCD34D'; // Gold
    ctx.font = `bold 40px 'Quicksand', sans-serif`;
    ctx.fillText(`- ${author}`, width / 2, authorY);

    // Convert to Data URL
    resolve(canvas.toDataURL('image/png'));
  });
};
