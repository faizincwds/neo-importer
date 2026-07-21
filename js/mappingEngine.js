import { FIELD_SYNONYMS, DICTIONARY_CACHE_KEY } from './config.js';
import { normalizeString, similarity } from './utils.js';

export function buildDictionary() {
  // Gabungkan sinonim bawaan dan custom dictionary dari localStorage
  let custom = {};
  try {
    custom = JSON.parse(localStorage.getItem(DICTIONARY_CACHE_KEY)) || {};
  } catch (e) {}
  const merged = { ...FIELD_SYNONYMS };
  for (const key in custom) {
    merged[key] = [...new Set([...(merged[key] || []), ...custom[key]])];
  }
  return merged;
}

export function autoMapHeaders(headers, targetFields) {
  const dictionary = buildDictionary();
  const mapping = {};
  const normalizedTargets = targetFields.map(f => ({ field: f, norm: normalizeString(f) }));

  for (const header of headers) {
    const normHeader = normalizeString(header);
    let bestMatch = null;
    let bestScore = 0;

    for (const target of normalizedTargets) {
      // 1. Exact match after normalization
      if (normHeader === target.norm) {
        bestMatch = target.field;
        bestScore = 1;
        break;
      }
      // 2. Check synonyms
      const synonyms = dictionary[target.field] || [];
      for (const syn of synonyms) {
        if (normalizeString(syn) === normHeader) {
          bestMatch = target.field;
          bestScore = 1;
          break;
        }
      }
      if (bestScore === 1) break;
      // 3. Similarity fuzzy
      const sim = similarity(normHeader, target.norm);
      if (sim > bestScore) {
        bestScore = sim;
        bestMatch = target.field;
      }
    }

    if (bestMatch && bestScore >= 0.8) {
      mapping[header] = { target: bestMatch, automatic: true, confidence: bestScore };
    } else {
      mapping[header] = { target: null, automatic: false, confidence: 0 };
    }
  }
  return mapping;
}