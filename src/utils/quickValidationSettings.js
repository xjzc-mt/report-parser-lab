export const LS_QUICK_VALIDATION_THRESHOLD = 'llm_lab_quick_validation_threshold';
export const LS_QUICK_VALIDATION_INCLUDE_HALLUCINATION = 'llm_lab_quick_validation_include_hallucination';
export const DEFAULT_QUICK_VALIDATION_THRESHOLD = 70;

export function normalizeQuickValidationThreshold(value) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_QUICK_VALIDATION_THRESHOLD;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_QUICK_VALIDATION_THRESHOLD;
  }
  return Math.min(100, Math.max(0, parsed));
}

export function loadQuickValidationThreshold(storage = globalThis.localStorage) {
  try {
    return normalizeQuickValidationThreshold(storage?.getItem?.(LS_QUICK_VALIDATION_THRESHOLD));
  } catch (_) {
    return DEFAULT_QUICK_VALIDATION_THRESHOLD;
  }
}

export function saveQuickValidationThreshold(value, storage = globalThis.localStorage) {
  const normalized = normalizeQuickValidationThreshold(value);
  try {
    storage?.setItem?.(LS_QUICK_VALIDATION_THRESHOLD, String(normalized));
  } catch (_) {
    // ignore persistence failures
  }
  return normalized;
}


export function normalizeQuickValidationIncludeHallucination(value, fallback = true) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') {
    return false;
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'on') {
    return true;
  }
  return fallback;
}

export function loadQuickValidationIncludeHallucination(storage = globalThis.localStorage) {
  try {
    return normalizeQuickValidationIncludeHallucination(
      storage?.getItem?.(LS_QUICK_VALIDATION_INCLUDE_HALLUCINATION)
    );
  } catch (_) {
    return true;
  }
}

export function saveQuickValidationIncludeHallucination(value, storage = globalThis.localStorage) {
  const normalized = normalizeQuickValidationIncludeHallucination(value);
  try {
    storage?.setItem?.(LS_QUICK_VALIDATION_INCLUDE_HALLUCINATION, String(normalized));
  } catch (_) {
    // ignore persistence failures
  }
  return normalized;
}
