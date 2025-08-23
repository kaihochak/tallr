#!/usr/bin/env node
/* eslint-disable no-console */

// ===== Config =====
const STOPS_HEX = ["EEAECA", "94BBE9"];   // pink -> light blue
const SCALE_X = 1.0;

// ===== Color utils =====
const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const hasTruecolor =
  /\b(truecolor|24bit)\b/i.test(process.env.COLORTERM || "") ||
  process.env.FORCE_COLOR === "3";

const ansi24  = (r,g,b)=>`\x1b[38;2;${r};${g};${b}m`;
const ansi256 = n=>`\x1b[38;5;${n}m`;
const reset   = "\x1b[0m";

const hexToRgb = h => { const n=parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; };
const STOPS = STOPS_HEX.map(hexToRgb);

const lerp=(a,b,t)=>a+(b-a)*t;
const lerpRGB=(A,B,t)=>[0,1,2].map(i=>Math.round(lerp(A[i],B[i],t)));

function rgbToAnsi256(r,g,b){
  if (r===g&&g===b){ if (r<8) return 16; if (r>248) return 231; return Math.round(((r-8)/247)*24)+232; }
  const rc=Math.round((r/255)*5), gc=Math.round((g/255)*5), bc=Math.round((b/255)*5);
  return 16 + 36*rc + 6*gc + bc;
}
const tokenFromRgb = ([r,g,b]) => hasTruecolor ? ansi24(r,g,b) : ansi256(rgbToAnsi256(r,g,b));

function colorForT(pos){ // pos in [0,1]
  const [A,B] = STOPS;
  const [r,g,b] = lerpRGB(A,B,pos);
  return tokenFromRgb([r,g,b]);
}

// ===== ASCII wordmark =====
const asciiBase = [
"",
" ███████████           ████  ████           ",
"░█░░░███░░░█          ░░███ ░░███           ",
"░   ░███  ░   ██████   ░███  ░███  ████████ ",
"    ░███     ░░░░░███  ░███  ░███ ░░███░░███",
"    ░███      ███████  ░███  ░███  ░███ ░░░ ",
"    ░███     ███░░███  ░███  ░███  ░███     ",
"    █████   ░░████████ █████ █████ █████    ",
"   ░░░░░     ░░░░░░░░ ░░░░░ ░░░░░ ░░░░░     ",
"",
" AI CLI Session Monitor  •  https://github.com/kaihochak/tallr",
];

// ===== Render =====
function widenLine(line, k=SCALE_X){
  if (k <= 1) return line;
  let out = ""; const reps = Math.max(1, Math.round(k));
  for (const ch of line) out += ch.repeat(reps);
  return out;
}

export function showLogo(){
  const widened = asciiBase.map(l => widenLine(l));
  const width = Math.max(...widened.map(l => [...l].length));

  // figure text span (skip empty lines)
  let minX = Infinity, maxX = -Infinity;
  for (const line of widened){
    const arr = [...line];
    arr.forEach((ch, x) => {
      if (ch !== " "){ minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    });
  }
  const span = Math.max(1, maxX - minX);

  const out = widened.map(line => {
    const chars = [...line.padEnd(width," ")];
    return chars.map((ch,x)=>{
      if (!isTTY || ch === " ") return ch;
      const t = Math.min(1, Math.max(0,(x-minX)/span));
      return colorForT(t) + ch + reset;
    }).join("");
  }).join("\n");

  console.log(out);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  showLogo();
}
