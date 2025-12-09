import { Quote } from "../types";
import quotesData from "../quotes.json";

export const generateQuote = async (): Promise<Quote> => {
  // 1. Pick a random quote from local data
  // Using static import for performance and bundling reliability
  const randomIndex = Math.floor(Math.random() * quotesData.length);
  const rawQuote = quotesData[randomIndex];
  
  // 2. Generate an image for this quote
  let imageUrl: string | undefined = undefined;
  try {
    imageUrl = await createQuoteImage(rawQuote.content, rawQuote.author);
  } catch (e) {
    console.error("Failed to generate quote image", e);
  }

  return {
    id: randomIndex,
    text: rawQuote.content,
    author: rawQuote.author,
    imageUrl: imageUrl
  };
};

/**
 * Generates a landscape 6:4 image (Data URL) containing the quote and author.
 */
const createQuoteImage = (text: string, author: string): Promise<string> => {
  return new Promise((resolve) => {
    // Create an off-screen canvas
    const canvas = document.createElement('canvas');
    // Aspect Ratio 6:4 (1200x800)
    const width = 1200;
    const height = 800;
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
    // Stroke is centered on the path, so we offset by half the line width to keep it inside
    ctx.strokeRect(1.5, 1.5, width - 3, height - 3);

    // --- Decoration (Icon) ---
    const iconY = 150;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(width / 2, iconY, 50, 0, Math.PI * 2);
    ctx.fill();
    
    // Quote Icon inside circle
    ctx.fillStyle = '#6A3CFF';
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('“', width / 2, iconY + 30);


    // --- Text Configuration ---
    const fontSize = 70; // Increased size from 60
    const lineHeight = 90;
    const fontFamily = "'Arsenal', sans-serif"; // Changed to Arsenal
    const textColor = '#ffffff';
    
    ctx.fillStyle = textColor;
    ctx.font = `italic ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // --- Wrap Text Logic ---
    const maxWidth = width - 200;
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
    // Calculate startY to center text vertically in the available space
    // Center point of canvas is height/2 = 400.
    // Bias slightly up (20px) to balance with author/footer at bottom
    let startY = (height / 2) - (totalTextHeight / 2) + 40;

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], width / 2, startY + (i * lineHeight));
    }

    // --- Author ---
    const authorY = startY + (lines.length * lineHeight) + 60;
    ctx.fillStyle = '#FCD34D'; // Gold/Copper color
    ctx.font = `bold 45px 'Quicksand', sans-serif`; // Changed to Quicksand, increased size
    ctx.fillText(`- ${author}`, width / 2, authorY);

    // Convert to Data URL
    resolve(canvas.toDataURL('image/png'));
  });
};