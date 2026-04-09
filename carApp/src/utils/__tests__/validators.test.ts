import {
  isRequired,
  isMinLength,
  isMaxLength,
  isValidEmail,
  isValidPhone,
  isValidFullName,
  isValidVehicleYear,
  isValidVehicleMake,
  isValidVehicleModel,
  isValidLicensePlate,
  isValidReviewText,
  isValidPromoCode,
  isValidBookingNotes,
  isValidRatingScore,
  containsFlaggedContent,
  FLAGGED_MESSAGE_REPLACEMENT,
} from '../validators';

// ── Generic Validators ────────────────────────────────────────────────

describe('isRequired', () => {
  it('fails on empty string', () => {
    expect(isRequired('', 'Name').valid).toBe(false);
  });

  it('fails on whitespace-only string', () => {
    expect(isRequired('   ', 'Name').valid).toBe(false);
  });

  it('passes on non-empty string', () => {
    expect(isRequired('hello', 'Name').valid).toBe(true);
  });

  it('includes field name in error', () => {
    expect(isRequired('', 'Email').error).toBe('Email is required');
  });
});

describe('isMinLength', () => {
  it('fails when too short', () => {
    expect(isMinLength('ab', 3, 'Bio').valid).toBe(false);
  });

  it('passes at exact minimum', () => {
    expect(isMinLength('abc', 3, 'Bio').valid).toBe(true);
  });
});

describe('isMaxLength', () => {
  it('fails when too long', () => {
    expect(isMaxLength('abcdef', 5, 'Code').valid).toBe(false);
  });

  it('passes at exact maximum', () => {
    expect(isMaxLength('abcde', 5, 'Code').valid).toBe(true);
  });
});

// ── Email ─────────────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('passes for valid email', () => {
    expect(isValidEmail('user@example.com').valid).toBe(true);
  });

  it('fails for missing @', () => {
    expect(isValidEmail('userexample.com').valid).toBe(false);
  });

  it('fails for missing domain', () => {
    expect(isValidEmail('user@').valid).toBe(false);
  });

  it('fails for empty string', () => {
    expect(isValidEmail('').valid).toBe(false);
  });

  it('passes for email with subdomain', () => {
    expect(isValidEmail('user@mail.example.com').valid).toBe(true);
  });
});

// ── Phone ─────────────────────────────────────────────────────────────

describe('isValidPhone', () => {
  it('passes for 10-digit number', () => {
    expect(isValidPhone('5551234567').valid).toBe(true);
  });

  it('passes for formatted number', () => {
    expect(isValidPhone('(555) 123-4567').valid).toBe(true);
  });

  it('passes for +1 prefix', () => {
    expect(isValidPhone('+15551234567').valid).toBe(true);
  });

  it('passes for dashed format', () => {
    expect(isValidPhone('555-123-4567').valid).toBe(true);
  });

  it('fails for too few digits', () => {
    expect(isValidPhone('12345').valid).toBe(false);
  });

  it('fails for empty string', () => {
    expect(isValidPhone('').valid).toBe(false);
  });
});

// ── Full Name ─────────────────────────────────────────────────────────

describe('isValidFullName', () => {
  it('passes for valid name', () => {
    expect(isValidFullName('John Doe').valid).toBe(true);
  });

  it('fails for single character', () => {
    expect(isValidFullName('J').valid).toBe(false);
  });

  it('fails for empty', () => {
    expect(isValidFullName('').valid).toBe(false);
  });

  it('fails for very long name', () => {
    expect(isValidFullName('A'.repeat(101)).valid).toBe(false);
  });
});

// ── Vehicle Fields ────────────────────────────────────────────────────

describe('isValidVehicleYear', () => {
  it('passes for current year', () => {
    const year = new Date().getFullYear().toString();
    expect(isValidVehicleYear(year).valid).toBe(true);
  });

  it('fails for year too old', () => {
    expect(isValidVehicleYear('1899').valid).toBe(false);
  });

  it('fails for non-numeric', () => {
    expect(isValidVehicleYear('abc').valid).toBe(false);
  });

  it('fails for empty', () => {
    expect(isValidVehicleYear('').valid).toBe(false);
  });
});

describe('isValidVehicleMake', () => {
  it('passes for non-empty make', () => {
    expect(isValidVehicleMake('Toyota').valid).toBe(true);
  });

  it('fails for empty', () => {
    expect(isValidVehicleMake('').valid).toBe(false);
  });
});

describe('isValidVehicleModel', () => {
  it('passes for non-empty model', () => {
    expect(isValidVehicleModel('Camry').valid).toBe(true);
  });

  it('fails for empty', () => {
    expect(isValidVehicleModel('').valid).toBe(false);
  });
});

describe('isValidLicensePlate', () => {
  it('passes for valid plate', () => {
    expect(isValidLicensePlate('ABC1234').valid).toBe(true);
  });

  it('passes for empty (optional)', () => {
    expect(isValidLicensePlate('').valid).toBe(true);
  });

  it('fails for single character', () => {
    expect(isValidLicensePlate('A').valid).toBe(false);
  });

  it('fails for too long', () => {
    expect(isValidLicensePlate('A'.repeat(11)).valid).toBe(false);
  });
});

// ── Review Text ───────────────────────────────────────────────────────

describe('isValidReviewText', () => {
  it('passes for empty (optional)', () => {
    expect(isValidReviewText('').valid).toBe(true);
  });

  it('passes for valid review', () => {
    expect(isValidReviewText('Great service!').valid).toBe(true);
  });

  it('fails for text over 500 characters', () => {
    expect(isValidReviewText('A'.repeat(501)).valid).toBe(false);
  });

  it('passes at exactly 500 characters', () => {
    expect(isValidReviewText('A'.repeat(500)).valid).toBe(true);
  });
});

// ── Promo Code ────────────────────────────────────────────────────────

describe('isValidPromoCode', () => {
  it('passes for valid code', () => {
    expect(isValidPromoCode('SAVE20').valid).toBe(true);
  });

  it('passes for code with hyphens and underscores', () => {
    expect(isValidPromoCode('FIRST-TIME_10').valid).toBe(true);
  });

  it('fails for empty', () => {
    expect(isValidPromoCode('').valid).toBe(false);
  });

  it('fails for too short', () => {
    expect(isValidPromoCode('AB').valid).toBe(false);
  });

  it('fails for special characters', () => {
    expect(isValidPromoCode('SAVE@20').valid).toBe(false);
  });
});

// ── Booking Notes ─────────────────────────────────────────────────────

describe('isValidBookingNotes', () => {
  it('passes for empty (optional)', () => {
    expect(isValidBookingNotes('').valid).toBe(true);
  });

  it('passes for valid notes', () => {
    expect(isValidBookingNotes('Please park in the driveway').valid).toBe(true);
  });

  it('fails for notes over 1000 characters', () => {
    expect(isValidBookingNotes('A'.repeat(1001)).valid).toBe(false);
  });
});

// ── Rating Score ──────────────────────────────────────────────────────

describe('isValidRatingScore', () => {
  it('passes for score 1', () => {
    expect(isValidRatingScore(1).valid).toBe(true);
  });

  it('passes for score 5', () => {
    expect(isValidRatingScore(5).valid).toBe(true);
  });

  it('fails for score 0', () => {
    expect(isValidRatingScore(0).valid).toBe(false);
  });

  it('fails for score 6', () => {
    expect(isValidRatingScore(6).valid).toBe(false);
  });

  it('fails for non-integer', () => {
    expect(isValidRatingScore(3.5).valid).toBe(false);
  });
});

// ── Content Moderation: containsFlaggedContent ────────────────────────

describe('containsFlaggedContent', () => {
  it('returns false for empty string', () => {
    expect(containsFlaggedContent('')).toBe(false);
  });

  it('returns false for normal message', () => {
    expect(containsFlaggedContent('Hi, what time works for the detailing?')).toBe(false);
  });

  it('returns false for short numbers in normal context', () => {
    expect(containsFlaggedContent('I have 3 cars to detail')).toBe(false);
  });

  // Phone numbers
  it('flags 10-digit phone number', () => {
    expect(containsFlaggedContent('Call me at 5551234567')).toBe(true);
  });

  it('flags formatted phone number', () => {
    expect(containsFlaggedContent('My number is (555) 123-4567')).toBe(true);
  });

  it('flags phone with +1', () => {
    expect(containsFlaggedContent('Reach me at +15551234567')).toBe(true);
  });

  it('flags dashed phone number', () => {
    expect(containsFlaggedContent('Text me 555-123-4567')).toBe(true);
  });

  // Email addresses
  it('flags email address', () => {
    expect(containsFlaggedContent('Email me at john@gmail.com')).toBe(true);
  });

  it('flags email with subdomain', () => {
    expect(containsFlaggedContent('My email is user@mail.company.com')).toBe(true);
  });

  // Payment handles
  it('flags Venmo mention', () => {
    expect(containsFlaggedContent('Venmo me instead')).toBe(true);
  });

  it('flags CashApp mention', () => {
    expect(containsFlaggedContent('Just send it on CashApp')).toBe(true);
  });

  it('flags Cash App with space', () => {
    expect(containsFlaggedContent('Pay me on Cash App')).toBe(true);
  });

  it('flags $cashtag', () => {
    expect(containsFlaggedContent('Send to $johndoe')).toBe(true);
  });

  it('flags PayPal mention', () => {
    expect(containsFlaggedContent('Use PayPal to pay me')).toBe(true);
  });

  it('flags Zelle mention', () => {
    expect(containsFlaggedContent('I prefer Zelle')).toBe(true);
  });

  it('flags "pay me via" pattern', () => {
    expect(containsFlaggedContent('Just pay me via text')).toBe(true);
  });

  // Contact sharing
  it('flags "text me at" with phone number', () => {
    expect(containsFlaggedContent('Text me at 555-123-4567')).toBe(true);
  });

  it('flags "my personal email" reference', () => {
    expect(containsFlaggedContent('Send to my personal email')).toBe(true);
  });

  it('flags social media redirect', () => {
    expect(containsFlaggedContent('DM me on Instagram for faster reply')).toBe(true);
  });

  it('flags WhatsApp redirect', () => {
    expect(containsFlaggedContent('Message me on WhatsApp')).toBe(true);
  });

  // FLAGGED_MESSAGE_REPLACEMENT constant
  it('exports correct replacement string', () => {
    expect(FLAGGED_MESSAGE_REPLACEMENT).toBe('[Message flagged for review]');
  });
});
