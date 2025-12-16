// CSV record type for email template translations
export interface EmailTemplateTranslationRecord {
  templateName: string;
  typeId: string;
  [key: string]: string | number; // Allow dynamic locale-based column names
}

// Helper function to extract translation keys from email template body
// Looks for patterns like {{lang "key_name" ...}} or {{lang "key_name"}}
// Handles HTML-encoded entities, single/double quotes, and multiline patterns
//
// Supported patterns:
// - {{lang "key_name"}} - double quotes (most common)
// - {{lang "key_name" "default_value"}} - with default value
// - {{lang 'key_name'}} - single quotes
// - {{lang key_name}} - without quotes (alphanumeric and underscore only)
// - Multiline patterns with any of the above
// - HTML-encoded entities like &quot; instead of "
//
// Examples:
//   extractTranslationKeys('Hello {{lang "welcome_message"}}') -> ['welcome_message']
//   extractTranslationKeys('{{lang "reset_password"}} Click here') -> ['reset_password']
//   extractTranslationKeys('&lt;p&gt;{{lang &quot;key&quot;}}&lt;/p&gt;') -> ['key']
export function extractTranslationKeys(body: string): string[] {
  if (!body) return [];
  
  const keys: Set<string> = new Set();
  
  // First, decode HTML entities to handle cases like &quot; instead of "
  let decodedBody = body;
  try {
    // Replace common HTML entities
    decodedBody = decodedBody
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  } catch (e) {
    // If decoding fails, use original body
    decodedBody = body;
  }
  
  // Unified pattern that handles multiple cases:
  // 1. {{lang "key"}} or {{lang "key" "default"}} with double quotes
  // 2. {{lang 'key'}} with single quotes  
  // 3. {{lang key}} without quotes (less common)
  // 4. Multiline patterns
  // This pattern matches lang followed by optional whitespace, then:
  // - "key" or 'key' (captured in group 1)
  // - or key without quotes (captured in group 2)
  // Then matches until closing }}
  const langPatterns = [
    // Pattern 1: Double quotes - most common
    /\{\{lang\s+"([^"]+)"[^}]*\}\}/g,
    // Pattern 2: Single quotes
    /\{\{lang\s+'([^']+)'[^}]*\}\}/g,
    // Pattern 3: No quotes (alphanumeric and underscore only)
    /\{\{lang\s+([a-zA-Z0-9_]+)[^}]*\}\}/g,
    // Pattern 4: Multiline with double quotes
    /\{\{lang\s+"([^"]+)"[\s\S]*?\}\}/g,
    // Pattern 5: Multiline with single quotes
    /\{\{lang\s+'([^']+)'[\s\S]*?\}\}/g,
  ];
  
  for (const pattern of langPatterns) {
    let match;
    // Reset regex lastIndex to ensure we check from the beginning
    pattern.lastIndex = 0;
    while ((match = pattern.exec(decodedBody)) !== null) {
      // match[1] contains the captured key name
      const key = match[1];
      if (key && key.trim()) {
        keys.add(key.trim());
      }
    }
  }
  
  return Array.from(keys).sort();
}

// Helper function to extract translation keys with their default values
// Returns a map of key -> default value (or empty string if no default)
export function extractTranslationKeysWithDefaults(body: string): Record<string, string> {
  if (!body) return {};
  
  const keysMap: Record<string, string> = {};
  
  // First, decode HTML entities
  let decodedBody = body;
  try {
    decodedBody = decodedBody
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  } catch (e) {
    decodedBody = body;
  }
  
  // Pattern 1: {{lang "key" "default"}} with double quotes and default value
  const patternWithDefault = /\{\{lang\s+"([^"]+)"\s+"([^"]+)"[^}]*\}\}/g;
  let match;
  
  while ((match = patternWithDefault.exec(decodedBody)) !== null) {
    const key = match[1]?.trim();
    const defaultValue = match[2]?.trim();
    if (key) {
      keysMap[key] = defaultValue || '';
    }
  }
  
  // Pattern 2: {{lang "key"}} without default value - extract key only
  const patternWithoutDefault = /\{\{lang\s+"([^"]+)"[^}]*\}\}/g;
  patternWithoutDefault.lastIndex = 0;
  
  while ((match = patternWithoutDefault.exec(decodedBody)) !== null) {
    const key = match[1]?.trim();
    if (key && !keysMap.hasOwnProperty(key)) {
      keysMap[key] = '';
    }
  }
  
  // Pattern 3: Single quotes with default
  const patternSingleWithDefault = /\{\{lang\s+'([^']+)'\s+'([^']+)'[^}]*\}\}/g;
  patternSingleWithDefault.lastIndex = 0;
  
  while ((match = patternSingleWithDefault.exec(decodedBody)) !== null) {
    const key = match[1]?.trim();
    const defaultValue = match[2]?.trim();
    if (key) {
      keysMap[key] = defaultValue || '';
    }
  }
  
  // Pattern 4: Single quotes without default
  const patternSingleWithoutDefault = /\{\{lang\s+'([^']+)'[^}]*\}\}/g;
  patternSingleWithoutDefault.lastIndex = 0;
  
  while ((match = patternSingleWithoutDefault.exec(decodedBody)) !== null) {
    const key = match[1]?.trim();
    if (key && !keysMap.hasOwnProperty(key)) {
      keysMap[key] = '';
    }
  }
  
  return keysMap;
}

// Helper function to extract readable text from email template body
// Replaces {{lang "key" "default"}} patterns with their default values
export function extractReadableText(body: string, defaultValues: Record<string, string> = {}): string {
  if (!body) return '';
  
  let text = body;
  
  // Decode HTML entities
  try {
    text = text
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  } catch (e) {
    // Keep original if decoding fails
  }
  
  // Replace {{lang "key" "default"}} with default value
  text = text.replace(/\{\{lang\s+"([^"]+)"\s+"([^"]+)"[^}]*\}\}/g, (match, key, defaultValue) => {
    return defaultValue || defaultValues[key] || `[${key}]`;
  });
  
  // Replace {{lang "key"}} with default value from map or key name
  text = text.replace(/\{\{lang\s+"([^"]+)"[^}]*\}\}/g, (match, key) => {
    return defaultValues[key] || `[${key}]`;
  });
  
  // Replace {{lang 'key' 'default'}} with default value
  text = text.replace(/\{\{lang\s+'([^']+)'\s+'([^']+)'[^}]*\}\}/g, (match, key, defaultValue) => {
    return defaultValue || defaultValues[key] || `[${key}]`;
  });
  
  // Replace {{lang 'key'}} with default value from map or key name
  text = text.replace(/\{\{lang\s+'([^']+)'[^}]*\}\}/g, (match, key) => {
    return defaultValues[key] || `[${key}]`;
  });
  
  // Remove HTML tags but keep text content
  text = text.replace(/<[^>]*>/g, ' ');
  
  // Clean up multiple spaces
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

// Helper function to get locale-specific field
export function getLocaleField(record: EmailTemplateTranslationRecord, fieldPrefix: string, locale: string): string {
  const key = `${fieldPrefix}_${locale}`;
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

// Helper function to prepare email template translation data for update
export function prepareEmailTemplateTranslationData(
  record: EmailTemplateTranslationRecord, 
  locale: string,
  defaultSubject: string,
  defaultBody: string
) {
  const subject = getLocaleField(record, 'subject', locale) || defaultSubject;
  const body = getLocaleField(record, 'body', locale) || defaultBody;
  
  return {
    subject,
    body,
  };
}

// Helper function to generate CSV headers for email template translations
// This function is called with all templates to generate headers for all keys
export function generateEmailTemplateCSVHeaders(
  defaultLocale: string, 
  targetLocale: string,
  allKeys?: string[]
): string[] {
  const baseHeaders = ['templateName', 'typeId'];
  
  if (allKeys && allKeys.length > 0) {
    const keyHeaders = allKeys.sort().flatMap(key => [
      `key_${key}_${defaultLocale}`,
      `key_${key}_${targetLocale}`
    ]);
    return [...baseHeaders, ...keyHeaders];
  }
  
  return baseHeaders;
}

// Helper function to format email template data for CSV export
export function formatEmailTemplateDataForCSV(
  templateName: string,
  typeId: string,
  subject: string,
  body: string,
  translation: { keys?: Record<string, string> } | undefined,
  defaultLocale: string,
  targetLocale: string
): EmailTemplateTranslationRecord {
  const record: EmailTemplateTranslationRecord = {
    templateName,
    typeId,
  };
  
  // Extract keys from body to get all available keys
  const availableKeys = extractTranslationKeys(body);
  
  // Add keys from translation (or empty strings if no translation)
  availableKeys.forEach(key => {
    record[`key_${key}_${defaultLocale}`] = ''; // Original key value (not stored, empty)
    record[`key_${key}_${targetLocale}`] = translation?.keys?.[key] || '';
  });
  
  return record;
}

// List of all email template types
export const EMAIL_TEMPLATE_TYPES = [
  'abandoned_cart_email',
  'account_details_changed_email',
  'combined_order_status_email',
  'createaccount_email',
  'createguestaccount_email',
  'giftcertificate_email',
  'invoice_email',
  'ordermessage_notification',
  'return_confirmation_email',
  'return_statuschange_email',
  'product_review_email',
  'account_reset_password_email',
] as const;

// Helper function to get display name for template type
export function getTemplateTypeDisplayName(typeId: string): string {
  const displayNames: Record<string, string> = {
    abandoned_cart_email: 'Abandoned Cart',
    account_details_changed_email: 'Account Details Changed',
    combined_order_status_email: 'Combined Order Status',
    createaccount_email: 'Create Account',
    createguestaccount_email: 'Create Guest Account',
    giftcertificate_email: 'Gift Certificate',
    invoice_email: 'Invoice',
    ordermessage_notification: 'Order Message Notification',
    return_confirmation_email: 'Return Confirmation',
    return_statuschange_email: 'Return Status Change',
    product_review_email: 'Product Review',
    account_reset_password_email: 'Account Reset Password',
  };
  
  return displayNames[typeId] || typeId;
}
