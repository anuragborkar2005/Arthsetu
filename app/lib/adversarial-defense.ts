/**
 * Adversarial Input Defense & Prompt Injection Sanitizer
 *
 * Protects the AI Diligence Layer from:
 * 1. Zero-width & invisible unicode obfuscation (e.g. \u200B, \u200C, \u200D, \uFEFF)
 * 2. Markdown & HTML comment injections (e.g. <!-- ignore previous instructions ... -->)
 * 3. Direct prompt injection & system jailbreak attempts
 * 4. Keyword stuffing / artificial repetition gaming
 */

export interface DefenseSanitizationResult {
  cleanedText: string;
  injectionsNeutralized: number;
  hiddenCharactersRemoved: number;
  repetitionAnomalyDetected: boolean;
  neutralizedPatterns: string[];
}

// Known adversarial prompt injection patterns to neutralize
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|directions)/gi,
  /system\s*:\s*(?:override|reset|you are now|output)/gi,
  /(?:you are now|act as|pretend to be)\s+(?:a developer|an unrestricted ai|in maintenance mode|in debug mode)/gi,
  /output\s+(?:trustscore|score|rating)\s*[:=]\s*(?:100|exceptional|99)/gi,
  /do\s+not\s+(?:audit|check|verify|evaluate)\s+(?:this|the|any)\s+(?:campaign|document|story)/gi,
  /disregard\s+(?:the\s+)?(?:rules|guidelines|scoring|instructions)/gi,
  /\bprompt\s*injection\b/gi,
];

// Zero-width and hidden unicode characters
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD\u2060\u180E]/g;

// HTML / Markdown comments: <!-- ... -->
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;

/**
 * Sanitizes input text against adversarial techniques before passing to tokenizers or AI models.
 */
export function sanitizeAgainstAdversarialInput(rawText: string): DefenseSanitizationResult {
  if (!rawText) {
    return {
      cleanedText: "",
      injectionsNeutralized: 0,
      hiddenCharactersRemoved: 0,
      repetitionAnomalyDetected: false,
      neutralizedPatterns: [],
    };
  }

  let text = rawText;
  let hiddenCharsCount = 0;
  let injectionsCount = 0;
  const neutralizedPatterns: string[] = [];

  // 1. Remove zero-width & invisible unicode characters
  const hiddenMatches = text.match(ZERO_WIDTH_REGEX);
  if (hiddenMatches) {
    hiddenCharsCount = hiddenMatches.length;
    text = text.replace(ZERO_WIDTH_REGEX, "");
  }

  // 2. Remove hidden HTML/Markdown comments (common vector for hidden prompt injection)
  const commentMatches = text.match(HTML_COMMENT_REGEX);
  if (commentMatches) {
    for (const comment of commentMatches) {
      // Check if comment contains prompt injection keywords
      for (const pattern of PROMPT_INJECTION_PATTERNS) {
        if (pattern.test(comment)) {
          injectionsCount++;
          neutralizedPatterns.push(`Hidden comment injection: "${comment.slice(0, 40)}..."`);
        }
      }
    }
    text = text.replace(HTML_COMMENT_REGEX, " ");
  }

  // 3. Neutralize direct prompt injection patterns in visible text
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    text = text.replace(pattern, (match) => {
      injectionsCount++;
      neutralizedPatterns.push(`Direct override attempt: "${match}"`);
      return "[ADVERSARIAL_INPUT_NEUTRALIZED]";
    });
  }

  // 4. Check for keyword stuffing / repetition anomaly
  // e.g. repeating "solana anchor program pda" 100 times to game keyword counters
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const wordFrequencies = new Map<string, number>();
  let maxFreq = 0;

  for (const w of words) {
    const freq = (wordFrequencies.get(w) || 0) + 1;
    wordFrequencies.set(w, freq);
    if (freq > maxFreq) maxFreq = freq;
  }

  const repetitionAnomalyDetected = words.length > 30 && maxFreq / words.length > 0.25;

  return {
    cleanedText: text.replace(/\s+/g, " ").trim(),
    injectionsNeutralized: injectionsCount,
    hiddenCharactersRemoved: hiddenCharsCount,
    repetitionAnomalyDetected,
    neutralizedPatterns,
  };
}
