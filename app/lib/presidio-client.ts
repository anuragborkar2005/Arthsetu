/**
 * Microsoft Presidio Client Adapter
 * Integrates with Microsoft Presidio Analyzer (NLP Named Entity Recognition via spaCy/Transformers)
 * and Microsoft Presidio Anonymizer for enterprise-grade PII de-identification.
 *
 * Repository: https://github.com/microsoft/presidio
 */

export interface PresidioRecognizedEntity {
  start: number;
  end: number;
  entity_type: string;
  score: number;
  analysis_explanation?: {
    recognizer_name?: string;
    pattern_name?: string;
    textual_explanation?: string;
    score?: number;
  };
}

export interface PresidioAnonymizeItem {
  start: number;
  end: number;
  entity_type: string;
  text: string;
  operator: string;
}

export interface PresidioAnonymizeResponse {
  text: string;
  items: PresidioAnonymizeItem[];
}

export interface PresidioConfig {
  analyzerUrl?: string;
  anonymizerUrl?: string;
  timeoutMs?: number;
  scoreThreshold?: number;
  entities?: string[];
}

export const DEFAULT_PRESIDIO_ENTITIES = [
  "PERSON",
  "LOCATION",
  "ORGANIZATION",
  "EMAIL_ADDRESS",
  "PHONE_NUMBER",
  "IBAN_CODE",
  "US_SSN",
  "IN_PAN",
  "IN_AADHAAR",
  "CREDIT_CARD",
  "CRYPTO",
  "DATE_TIME",
  "IP_ADDRESS",
  "MEDICAL_LICENSE",
  "URL",
];

export function getPresidioAnalyzerUrl(): string {
  return (
    process.env.PRESIDIO_ANALYZER_URL ||
    process.env.NEXT_PUBLIC_PRESIDIO_ANALYZER_URL ||
    "http://localhost:5001"
  );
}

export function getPresidioAnonymizerUrl(): string {
  return (
    process.env.PRESIDIO_ANONYMIZER_URL ||
    process.env.NEXT_PUBLIC_PRESIDIO_ANONYMIZER_URL ||
    "http://localhost:5002"
  );
}

export function isPresidioConfigured(): boolean {
  return Boolean(
    process.env.PRESIDIO_ANALYZER_URL ||
    process.env.NEXT_PUBLIC_PRESIDIO_ANALYZER_URL ||
    process.env.PRESIDIO_ANONYMIZER_URL ||
    process.env.NEXT_PUBLIC_PRESIDIO_ANONYMIZER_URL
  );
}

/**
 * Checks if the Presidio Analyzer and Anonymizer services are online and responding.
 */
export async function pingPresidio(config?: PresidioConfig): Promise<{
  analyzerOnline: boolean;
  anonymizerOnline: boolean;
}> {
  const analyzerUrl = config?.analyzerUrl || getPresidioAnalyzerUrl();
  const anonymizerUrl = config?.anonymizerUrl || getPresidioAnonymizerUrl();
  const timeoutMs = config?.timeoutMs || 1000;

  let analyzerOnline = false;
  let anonymizerOnline = false;

  try {
    const res = await fetch(`${analyzerUrl.replace(/\/$/, "")}/healthz`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    analyzerOnline = res.ok;
  } catch {
    analyzerOnline = false;
  }

  try {
    const res = await fetch(`${anonymizerUrl.replace(/\/$/, "")}/healthz`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    anonymizerOnline = res.ok;
  } catch {
    anonymizerOnline = false;
  }

  return { analyzerOnline, anonymizerOnline };
}

/**
 * Calls Presidio Analyzer to detect named entities (PERSON, LOCATION, EMAIL, etc.) using NLP.
 */
export async function analyzeWithPresidio(
  text: string,
  config?: PresidioConfig
): Promise<PresidioRecognizedEntity[]> {
  if (!text || text.trim().length === 0) return [];

  const analyzerUrl = config?.analyzerUrl || getPresidioAnalyzerUrl();
  const timeoutMs = config?.timeoutMs || 2500;
  const scoreThreshold = config?.scoreThreshold ?? 0.5;
  const entities = config?.entities || DEFAULT_PRESIDIO_ENTITIES;

  const endpoint = `${analyzerUrl.replace(/\/$/, "")}/analyze`;

  const payload = {
    text,
    language: "en",
    entities,
    score_threshold: scoreThreshold,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Presidio Analyzer failed with HTTP ${res.status}`);
  }

  const data = (await res.json()) as PresidioRecognizedEntity[];
  return Array.isArray(data) ? data : [];
}

/**
 * Calls Presidio Anonymizer to mask/replace detected PII entities with standard redaction tags.
 */
export async function anonymizeWithPresidio(
  text: string,
  analyzerResults: PresidioRecognizedEntity[],
  config?: PresidioConfig
): Promise<PresidioAnonymizeResponse> {
  if (!text || analyzerResults.length === 0) {
    return { text: text || "", items: [] };
  }

  const anonymizerUrl = config?.anonymizerUrl || getPresidioAnonymizerUrl();
  const timeoutMs = config?.timeoutMs || 2500;

  const endpoint = `${anonymizerUrl.replace(/\/$/, "")}/anonymize`;

  // Standardized replacement templates matching Arthasetu format
  const anonymizers = {
    DEFAULT: {
      type: "replace",
      new_value: "[PII_REDACTED]",
    },
    PERSON: {
      type: "replace",
      new_value: "[PERSON_REDACTED]",
    },
    LOCATION: {
      type: "replace",
      new_value: "[LOCATION_REDACTED]",
    },
    ORGANIZATION: {
      type: "replace",
      new_value: "[ORGANIZATION_REDACTED]",
    },
    EMAIL_ADDRESS: {
      type: "replace",
      new_value: "[EMAIL_REDACTED]",
    },
    PHONE_NUMBER: {
      type: "replace",
      new_value: "[PHONE_REDACTED]",
    },
    IBAN_CODE: {
      type: "replace",
      new_value: "[IBAN_REDACTED]",
    },
    CREDIT_CARD: {
      type: "replace",
      new_value: "[CARD_NUMBER_REDACTED]",
    },
    US_SSN: {
      type: "replace",
      new_value: "[TAX_ID_REDACTED]",
    },
    IN_PAN: {
      type: "replace",
      new_value: "[PAN_CARD_REDACTED]",
    },
    IN_AADHAAR: {
      type: "replace",
      new_value: "[AADHAAR_REDACTED]",
    },
    CRYPTO: {
      type: "replace",
      new_value: "[CRYPTO_KEY_REDACTED]",
    },
  };

  const payload = {
    text,
    anonymizers,
    analyzer_results: analyzerResults.map((r) => ({
      start: r.start,
      end: r.end,
      entity_type: r.entity_type,
      score: r.score,
    })),
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Presidio Anonymizer failed with HTTP ${res.status}`);
  }

  return (await res.json()) as PresidioAnonymizeResponse;
}

/**
 * End-to-end Presidio NLP sanitization pipeline (Analyze -> Anonymize).
 */
export async function sanitizeTextWithPresidioService(
  rawText: string,
  config?: PresidioConfig
): Promise<{
  sanitizedText: string;
  entitiesFound: PresidioRecognizedEntity[];
  anonymizedItems: PresidioAnonymizeItem[];
}> {
  if (!rawText) {
    return { sanitizedText: "", entitiesFound: [], anonymizedItems: [] };
  }

  const entities = await analyzeWithPresidio(rawText, config);
  if (entities.length === 0) {
    return { sanitizedText: rawText, entitiesFound: [], anonymizedItems: [] };
  }

  const anonymizeRes = await anonymizeWithPresidio(rawText, entities, config);
  return {
    sanitizedText: anonymizeRes.text,
    entitiesFound: entities,
    anonymizedItems: anonymizeRes.items,
  };
}
