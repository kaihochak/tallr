import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stripAnsi from "strip-ansi"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function extractLatestMessage(details: string): string {
  if (!details || details.trim() === '') {
    return '';
  }

  // First strip ANSI codes, then clean up Unicode box drawing and other UI characters
  const cleaned = stripAnsi(details)
    .replace(/[╭╰─│┌┐└┘┬┴┤├┼═║╚╔╗╝╬╦╩╠╣]/g, '') // Box drawing characters
    .replace(/[◯○●▲▼◆◇■□▪▫]/g, '') // Shape characters
    .trim();

  const lines = cleaned.split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (line.length === 0) return false;
      if (line === '>') return false;
      if (line.includes('? for shortcuts')) return false;
      if (line.includes('IDE disconnected')) return false;
      if (line.length < 3) return false;
      return true;
    });
  
  if (lines.length === 0) {
    return '';
  }
  
  // Return the last 4 lines
  const linesToShow = Math.min(4, lines.length);
  const selectedLines = lines.slice(-linesToShow);
  
  return selectedLines.join('\n');
}
