// CSV record type for shared modifier translations
export interface SharedModifierTranslationRecord {
  modifierId: number;
  valueId?: number; // Only for modifiers with values (dropdown, radio, etc.)
  [key: string]: string | number | undefined; // Allow dynamic locale-based column names
}

// Valid modifier types that have values
const MODIFIER_TYPES_WITH_VALUES = [
  'DropdownSharedProductModifier',
  'RadioButtonsSharedProductModifier',
  'RectangleListSharedProductModifier',
  'SwatchSharedProductModifier',
];

// Helper to check if modifier type has values
export function modifierTypeHasValues(type: string): boolean {
  return MODIFIER_TYPES_WITH_VALUES.includes(type);
}

// Helper function to get locale-specific field
export function getLocaleField(
  record: SharedModifierTranslationRecord,
  fieldPrefix: string,
  locale: string
): string {
  const key = `${fieldPrefix}_${locale}`;
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

// Helper to extract numeric ID from GraphQL ID format
export function extractNumericId(graphqlId: string): number {
  return parseInt(graphqlId.split('/').pop() || '0', 10);
}

// Helper function to prepare shared modifier translation data for update
// Takes records for a SINGLE modifier that have already been grouped
export function prepareSharedModifierTranslationData(
  records: SharedModifierTranslationRecord[],
  locale: string,
  modifierType: string,
  modifierId: number
): any {
  const firstRecord = records[0];
  const displayName = getLocaleField(firstRecord, 'displayName', locale);

  // Build modifier data based on type
  let modifierData: any;

  if (modifierTypeHasValues(modifierType)) {
    // Modifiers with values (dropdown, radio, swatch, rectangleList)
    const values = records
      .filter(r => r.valueId !== undefined)
      .map(r => ({
        valueId: `bc/store/sharedProductModifierValue/${r.valueId}`,
        label: getLocaleField(r, 'valueLabel', locale)
      }))
      .filter(v => v.label !== ''); // Only include values with translations

    const fieldName = modifierType
      .replace('SharedProductModifier', '')
      .charAt(0).toLowerCase() + 
      modifierType.replace('SharedProductModifier', '').slice(1);

    modifierData = {
      [fieldName]: {
        displayName: displayName || undefined,
        values: values.length > 0 ? values : undefined
      }
    };
  } else {
    // Modifiers without values (text, checkbox, date, file, etc.)
    const fieldName = modifierType
      .replace('SharedProductModifier', '')
      .charAt(0).toLowerCase() + 
      modifierType.replace('SharedProductModifier', '').slice(1);

    modifierData = {
      [fieldName]: {
        displayName: displayName || undefined
      }
    };
  }

  // Remove undefined fields
  const cleanData: any = {};
  Object.keys(modifierData).forEach(key => {
    const obj = modifierData[key];
    const cleanObj: any = {};
    Object.keys(obj).forEach(k => {
      if (obj[k] !== undefined) {
        cleanObj[k] = obj[k];
      }
    });
    if (Object.keys(cleanObj).length > 0) {
      cleanData[key] = cleanObj;
    }
  });

  if (Object.keys(cleanData).length === 0) {
    return null;
  }

  return {
    modifierId: `bc/store/sharedProductModifier/${modifierId}`,
    data: cleanData
  };
}

// Helper function to generate CSV headers for shared modifier translations
export function generateSharedModifierCSVHeaders(
  defaultLocale: string,
  targetLocale: string
): string[] {
  return [
    'modifierId',
    'valueId',
    `displayName_${defaultLocale}`,
    `displayName_${targetLocale}`,
    `valueLabel_${defaultLocale}`,
    `valueLabel_${targetLocale}`,
  ];
}

// Helper function to format shared modifier data for CSV export
export function formatSharedModifierForCSV(
  modifier: any,
  defaultLocale: string,
  targetLocale: string
): SharedModifierTranslationRecord[] {
  const numericModifierId = extractNumericId(modifier.id);
  const overrides = modifier.overridesForLocale;

  const records: SharedModifierTranslationRecord[] = [];

  // Check if modifier has values
  if (modifier.values && modifier.values.length > 0) {
    // First row: modifier displayName only
    records.push({
      modifierId: numericModifierId,
      [`displayName_${defaultLocale}`]: modifier.displayName || '',
      [`displayName_${targetLocale}`]: overrides?.displayName || '',
    });

    // Following rows: one per value (displayName empty)
    modifier.values.forEach((value: any) => {
      const numericValueId = extractNumericId(value.id);
      
      // Find corresponding override for this value
      const overrideValue = overrides?.values?.find(
        (ov: any) => extractNumericId(ov.id) === numericValueId
      );

      records.push({
        modifierId: numericModifierId,
        valueId: numericValueId,
        [`displayName_${defaultLocale}`]: '',
        [`displayName_${targetLocale}`]: '',
        [`valueLabel_${defaultLocale}`]: value.label || '',
        [`valueLabel_${targetLocale}`]: overrideValue?.label || '',
      });
    });
  } else {
    // One row for the modifier (only displayName, no fieldValue/defaultValue - those are global)
    records.push({
      modifierId: numericModifierId,
      [`displayName_${defaultLocale}`]: modifier.displayName || '',
      [`displayName_${targetLocale}`]: overrides?.displayName || '',
    });
  }

  return records;
}

// Helper to generate CSV template with example data
export function generateCSVTemplate(
  defaultLocale: string,
  targetLocale: string
): SharedModifierTranslationRecord[] {
  return [
    {
      modifierId: 1,
      [`displayName_${defaultLocale}`]: 'Size',
      [`displayName_${targetLocale}`]: 'Taglia',
    },
    {
      modifierId: 2,
      valueId: 1,
      [`displayName_${defaultLocale}`]: 'Color',
      [`displayName_${targetLocale}`]: 'Colore',
      [`valueLabel_${defaultLocale}`]: 'Red',
      [`valueLabel_${targetLocale}`]: 'Rosso',
    },
    {
      modifierId: 2,
      valueId: 2,
      [`displayName_${defaultLocale}`]: 'Color',
      [`displayName_${targetLocale}`]: 'Colore',
      [`valueLabel_${defaultLocale}`]: 'Blue',
      [`valueLabel_${targetLocale}`]: 'Blu',
    },
    {
      modifierId: 3,
      [`displayName_${defaultLocale}`]: 'Custom Text',
      [`displayName_${targetLocale}`]: 'Testo Personalizzato',
      [`defaultValue_${defaultLocale}`]: 'Enter text',
      [`defaultValue_${targetLocale}`]: 'Inserisci testo',
    },
  ];
}

// Validation helper
export function validateCSVRecord(
  record: SharedModifierTranslationRecord,
  rowNumber: number,
  locale: string
): string[] {
  const errors: string[] = [];

  if (!record.modifierId || record.modifierId === 0) {
    errors.push(`Row ${rowNumber}: modifierId is required`);
  }

  // At least one translation field should be present
  const hasTranslation = Object.keys(record).some(key => 
    key.endsWith(`_${locale}`) && record[key] !== '' && record[key] !== undefined
  );

  if (!hasTranslation) {
    errors.push(`Row ${rowNumber}: No translation provided for locale ${locale}`);
  }

  return errors;
}
