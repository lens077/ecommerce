/**
 * 输入归一化（设计 §4.3）。顺序固定：去首尾空白 → 全角标点转半角 → 去成对引号 →
 * 去句末标点 → 英文转小写 → 折叠空白。不分词，三条固定命令不需要。
 */

const FULL_TO_HALF: Record<string, string> = {
  "，": ",",
  "。": ".",
  "！": "!",
  "？": "?",
  "：": ":",
  "；": ";",
  "（": "(",
  "）": ")",
  "　": " ",
};

const PAIRED_QUOTES: [string, string][] = [
  ["「", "」"],
  ["『", "』"],
  ["“", "”"],
  ["‘", "’"],
  ['"', '"'],
  ["'", "'"],
];

export function normalizeInput(raw: string): string {
  let s = raw.trim();
  s = s.replace(/[，。！？：；（）　]/g, (ch) => FULL_TO_HALF[ch] ?? ch);
  for (const [open, close] of PAIRED_QUOTES) {
    // 只去成对出现的引号：单边引号可能是用户输入的一部分，保留
    const re = new RegExp(
      `${escape(open)}([^${escape(open)}${escape(close)}]*)${escape(close)}`,
      "g",
    );
    s = s.replace(re, "$1");
  }
  s = s.replace(/[.!?]+$/, "");
  s = s.toLowerCase();
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function escape(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
