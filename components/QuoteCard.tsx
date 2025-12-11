
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
 * Generates a standard Social Card image (600x400 - 3:2 Aspect Ratio)
 * Padding: 10% Horizontal, 15% Vertical
 */
const createQuoteImage = (text: string, author: string): Promise<string> => {
  return new Promise((resolve) => {
    // Create an off-screen canvas
    const canvas = document.createElement('canvas');
    // Dimensions: 600x400
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

    // --- Border (3px) ---
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(1.5, 1.5, width - 3, height - 3);

    // --- Decoration (Icon) ---
    // Scaled down icon at top
    const iconY = 45; 
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(width / 2, iconY, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Quote Icon inside circle
    ctx.fillStyle = '#6A3CFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('“', width / 2, iconY + 12);


    // --- Text Configuration ---
    // Dynamic font sizing to fit within padding
    // Padding X: 10% = 60px -> Max Width = 480px
    // Padding Y: 15% = 60px -> Max Height = 280px (approx)
    
    const paddingX = width * 0.10;
    // We aim for vertical content to be roughly centralized, respecting a "safe area" 
    // but the constraint is "always fits".
    const safeHeight = height * 0.70; // 100% - 15% top - 15% bottom

    const maxWidth = width - (paddingX * 2); 
    const fontFamily = "'Arsenal', sans-serif";
    const authorFontFamily = "'Quicksand', sans-serif";
    
    let fontSize = 36; // Start slightly smaller than before
    let lineHeight = 0;
    let authorFontSize = 0;
    let lines: string[] = [];
    let fits = false;

    // Loop to find fitting font size
    while (fontSize > 10) {
      ctx.font = `italic ${fontSize}px ${fontFamily}`;
      lineHeight = fontSize * 1.35;
      authorFontSize = Math.max(14, fontSize * 0.65); // Author smaller than text

      const words = text.split(' ');
      let line = '';
      lines = [];

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

      const totalHeight = (lines.length * lineHeight) + 20 + authorFontSize; // 20 is gap

      if (totalHeight <= safeHeight) {
        fits = true;
        break;
      }
      fontSize -= 2;
    }

    if (!fits) {
        // Fallback for extremely long text (shouldn't happen with standard quotes)
        fontSize = 12;
    }

    // --- Draw Content ---
    const totalContentHeight = (lines.length * lineHeight) + 20 + authorFontSize;
    const blockTopY = (height / 2) - (totalContentHeight / 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = `italic ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < lines.length; i++) {
        // Line position: BlockTop + (LineIndex * LH) + Half LH
        ctx.fillText(lines[i], width / 2, blockTopY + (i * lineHeight) + (lineHeight / 2));
    }

    // --- Author ---
    const authorY = blockTopY + (lines.length * lineHeight) + 20 + (authorFontSize / 2);
    ctx.fillStyle = '#FCD34D'; // Gold
    ctx.font = `bold ${authorFontSize}px ${authorFontFamily}`;
    ctx.fillText(`- ${author}`, width / 2, authorY);

    // Convert to Data URL
    resolve(canvas.toDataURL('image/png'));
  });
};
