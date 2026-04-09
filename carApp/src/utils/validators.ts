// Form validation + content moderation utilities for CarApp.
// All validation logic lives here — components never validate directly.

// ── Validation Result ─────────────────────────────────────────────────

export type ValidationResult = {
  valid: boolean;
  error: string | null;
};

function pass(): ValidationResult {
  return { valid: true, error: null };
}

function fail(error: string): ValidationResult {
  return { valid: false, error };
}

// ── Generic Validators ────────────────────────────────────────────────

export function isRequired(value: string, fieldName: string): ValidationResult {
  if (!value || value.trim().length === 0) {
    return fail(`${fieldName} is required`);
  }
  return pass();
}

export function isMinLength(value: string, min: number, fieldName: string): ValidationResult {
  if (value.trim().length < min) {
    return fail(`${fieldName} must be at least ${min} characters`);
  }
  return pass();
}

export function isMaxLength(value: string, max: number, fieldName: string): ValidationResult {
  if (value.trim().length > max) {
    return fail(`${fieldName} must be ${max} characters or less`);
  }
  return pass();
}

// ── Email ─────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): ValidationResult {
  if (!email || email.trim().length === 0) {
    return fail('Email is required');
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return fail('Enter a valid email address');
  }
  return pass();
}

// ── Phone (US) ────────────────────────────────────────────────────────

// Accepts: (555) 123-4567, 555-123-4567, 5551234567, +15551234567
const US_PHONE_REGEX = /^(\+1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

export function isValidPhone(phone: string): ValidationResult {
  if (!phone || phone.trim().length === 0) {
    return fail('Phone number is required');
  }
  const cleaned = phone.trim().replace(/[\s()-]/g, '');
  if (!US_PHONE_REGEX.test(phone.trim()) || cleaned.replace(/[^0-9]/g, '').length < 10) {
    return fail('Enter a valid US phone number');
  }
  return pass();
}

// ── Full Name ─────────────────────────────────────────────────────────

export function isValidFullName(name: string): ValidationResult {
  const required = isRequired(name, 'Full name');
  if (!required.valid) return required;

  if (name.trim().length < 2) {
    return fail('Full name must be at least 2 characters');
  }
  if (name.trim().length > 100) {
    return fail('Full name must be 100 characters or less');
  }
  return pass();
}

// ── Vehicle Fields ────────────────────────────────────────────────────

export function isValidVehicleYear(year: string): ValidationResult {
  const required = isRequired(year, 'Year');
  if (!required.valid) return required;

  const num = parseInt(year, 10);
  if (isNaN(num) || num < 1900 || num > new Date().getFullYear() + 1) {
    return fail('Enter a valid vehicle year');
  }
  return pass();
}

export function isValidVehicleMake(make: string): ValidationResult {
  return isRequired(make, 'Make');
}

export function isValidVehicleModel(model: string): ValidationResult {
  return isRequired(model, 'Model');
}

export function isValidLicensePlate(plate: string): ValidationResult {
  if (!plate || plate.trim().length === 0) return pass(); // optional field
  if (plate.trim().length < 2 || plate.trim().length > 10) {
    return fail('Enter a valid license plate');
  }
  return pass();
}

// ── Review Text ───────────────────────────────────────────────────────

const REVIEW_MAX_LENGTH = 500; // matches ratings.review_text VARCHAR(500)

export function isValidReviewText(text: string): ValidationResult {
  if (!text || text.trim().length === 0) return pass(); // optional
  return isMaxLength(text, REVIEW_MAX_LENGTH, 'Review');
}

// ── Promo Code ────────────────────────────────────────────────────────

const PROMO_CODE_REGEX = /^[A-Z0-9_-]{3,20}$/;

export function isValidPromoCode(code: string): ValidationResult {
  const required = isRequired(code, 'Promo code');
  if (!required.valid) return required;

  if (!PROMO_CODE_REGEX.test(code.trim().toUpperCase())) {
    return fail('Enter a valid promo code');
  }
  return pass();
}

// ── Booking Notes ─────────────────────────────────────────────────────

const NOTES_MAX_LENGTH = 1000;

export function isValidBookingNotes(notes: string): ValidationResult {
  if (!notes || notes.trim().length === 0) return pass(); // optional
  return isMaxLength(notes, NOTES_MAX_LENGTH, 'Notes');
}

// ── Rating Score ──────────────────────────────────────────────────────

export function isValidRatingScore(score: number): ValidationResult {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return fail('Rating must be between 1 and 5');
  }
  return pass();
}

// ── Content Moderation ────────────────────────────────────────────────
// ALL outbound messages must pass through containsFlaggedContent()
// before insert. Detects phone numbers, email addresses, and external
// payment handles. Flagged body is replaced with
// "[Message flagged for review]".

// Phone number patterns (7+ consecutive digits, with optional separators)
const PHONE_PATTERN = /(\+?\d[\d\s.()-]{6,}\d)/;

// Email pattern
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/i;

// External payment / contact sharing patterns
const PAYMENT_HANDLE_PATTERNS = [
  /venmo/i,
  /cashapp/i,
  /cash\s*app/i,
  /\$[a-zA-Z][a-zA-Z0-9_]{1,}/,  // $cashtag
  /paypal/i,
  /zelle/i,
  /apple\s*pay\s*me/i,
  /pay\s*me\s*(at|on|via|through)/i,
  /send\s*me\s*money/i,
];

// Personal contact sharing patterns
const CONTACT_SHARE_PATTERNS = [
  /(?:my|text|call|reach)\s*(?:me\s*(?:at|on))?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/i,
  /(?:my|personal|direct)\s*(?:email|e-mail)/i,
  /(?:hit|dm|message)\s*me\s*(?:on|at)\s*(?:insta|instagram|twitter|snap|snapchat|facebook|whatsapp|telegram|signal)/i,
];

/**
 * Checks whether a message contains content that should be flagged
 * for moderation. Used on ALL outbound messages before insert.
 *
 * Detects:
 * - Phone numbers
 * - Email addresses
 * - External payment handles (Venmo, CashApp, PayPal, Zelle)
 * - Attempts to share personal contact info or move off-platform
 *
 * Returns true if the content should be flagged.
 */
export function containsFlaggedContent(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  // Check for phone numbers
  if (PHONE_PATTERN.test(text)) {
    // Extract the match and verify it has at least 7 digits
    const match = text.match(PHONE_PATTERN);
    if (match) {
      const digitsOnly = match[1].replace(/\D/g, '');
      if (digitsOnly.length >= 7) return true;
    }
  }

  // Check for email addresses
  if (EMAIL_PATTERN.test(text)) return true;

  // Check for payment handles
  for (const pattern of PAYMENT_HANDLE_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  // Check for contact sharing attempts
  for (const pattern of CONTACT_SHARE_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  return false;
}

/** The replacement text used when a message is flagged. */
export const FLAGGED_MESSAGE_REPLACEMENT = '[Message flagged for review]';
