// CSV record type for shared option translations
export interface SharedOptionTranslationRecord {
  optionId: number;
  valueId?: number; // Only for options with values (dropdown, radio, etc.)
  [key: string]: string | number | undefined; // Allow dynamic locale-based column names
}

// Valid option types that have values
const OPTION_TYPES_WITH_VALUES = [
  'DropdownSharedProductOption',
  'RadioButtonsSharedProductOption',
  'RectangleListSharedProductOption',
  'SwatchSharedProductOption',
];

// Helper to check if option type has values
export function optionTypeHasValues(type: string): boolean {
  return OPTION_TYPES_WITH_VALUES.includes(type);
}

// Helper function to get locale-specific field
export function getLocaleField(
  record: SharedOptionTranslationRecord,
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

// Helper function to prepare shared option translation data for update
// Takes records for a SINGLE option that have already been grouped
export function prepareSharedOptionTranslationData(
  records: SharedOptionTranslationRecord[],
  locale: string,
  optionType: string,
  optionId: number
): any {
  const firstRecord = records[0];
  const displayName = getLocaleField(firstRecord, 'displayName', locale);

  // Build option data based on type
  let optionData: any;

  if (optionTypeHasValues(optionType)) {
    // Options with values (dropdown, radio, swatch, rectangleList)
    const values = records
      .filter(r => r.valueId !== undefined)
      .map(r => ({
        valueId: `bc/store/sharedProductOptionValue/${r.valueId}`,
        label: getLocaleField(r, 'valueLabel', locale)
      }))
      .filter(v => v.label !== ''); // Only include values with translations

    const fieldName = optionType
      .replace('SharedProductOption', '')
      .charAt(0).toLowerCase() + 
      optionType.replace('SharedProductOption', '').slice(1);

    optionData = {
      [fieldName]: {
        displayName: displayName || undefined,
        values: values.length > 0 ? values : undefined
      }
    };
  } else {
    // This shouldn't happen for options, but keeping for consistency
    const fieldName = optionType
      .replace('SharedProductOption', '')
      .charAt(0).toLowerCase() + 
      optionType.replace('SharedProductOption', '').slice(1);

    optionData = {
      [fieldName]: {
        displayName: displayName || undefined
      }
    };
  }

  // Remove undefined fields
  const cleanData: any = {};
  Object.keys(optionData).forEach(key => {
    const obj = optionData[key];
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
    optionId: `bc/store/sharedProductOption/${optionId}`,
    data: cleanData
  };
}

// Helper function to generate CSV headers for shared option translations
export function generateSharedOptionCSVHeaders(
  defaultLocale: string,
  targetLocale: string
): string[] {
  return [
    'optionId',
    'valueId',
    `displayName_${defaultLocale}`,
    `displayName_${targetLocale}`,
    `valueLabel_${defaultLocale}`,
    `valueLabel_${targetLocale}`,
  ];
}

// Helper function to format shared option data for CSV export
export function formatSharedOptionForCSV(
  option: any,
  defaultLocale: string,
  targetLocale: string
): SharedOptionTranslationRecord[] {
  const numericOptionId = extractNumericId(option.id);
  const overrides = option.overridesForLocale;

  const records: SharedOptionTranslationRecord[] = [];

  // Check if option has values
  if (option.values && option.values.length > 0) {
    // First row: option displayName only
    records.push({
      optionId: numericOptionId,
      [`displayName_${defaultLocale}`]: option.displayName || '',
      [`displayName_${targetLocale}`]: overrides?.displayName || '',
    });

    // Following rows: one per value (displayName empty)
    option.values.forEach((value: any) => {
      const numericValueId = extractNumericId(value.id);
      
      // Find corresponding override for this value
      const overrideValue = overrides?.values?.find(
        (ov: any) => extractNumericId(ov.id) === numericValueId
      );

      records.push({
        optionId: numericOptionId,
        valueId: numericValueId,
        [`displayName_${defaultLocale}`]: '',
        [`displayName_${targetLocale}`]: '',
        [`valueLabel_${defaultLocale}`]: value.label || '',
        [`valueLabel_${targetLocale}`]: overrideValue?.label || '',
      });
    });
  } else {
    // One row for the option (only displayName)
    records.push({
      optionId: numericOptionId,
      [`displayName_${defaultLocale}`]: option.displayName || '',
      [`displayName_${targetLocale}`]: overrides?.displayName || '',
    });
  }

  return records;
}

// Helper to generate CSV template with example data
export function generateCSVTemplate(
  defaultLocale: string,
  targetLocale: string
): SharedOptionTranslationRecord[] {
  return [
    {
      optionId: 1,
      [`displayName_${defaultLocale}`]: 'Size',
      [`displayName_${targetLocale}`]: 'Taglia',
    },
    {
      optionId: 1,
      valueId: 1,
      [`displayName_${defaultLocale}`]: '',
      [`displayName_${targetLocale}`]: '',
      [`valueLabel_${defaultLocale}`]: 'Small',
      [`valueLabel_${targetLocale}`]: 'Piccolo',
    },
    {
      optionId: 1,
      valueId: 2,
      [`displayName_${defaultLocale}`]: '',
      [`displayName_${targetLocale}`]: '',
      [`valueLabel_${defaultLocale}`]: 'Medium',
      [`valueLabel_${targetLocale}`]: 'Medio',
    },
    {
      optionId: 1,
      valueId: 3,
      [`displayName_${defaultLocale}`]: '',
      [`displayName_${targetLocale}`]: '',
      [`valueLabel_${defaultLocale}`]: 'Large',
      [`valueLabel_${targetLocale}`]: 'Grande',
    },
    {
      optionId: 2,
      [`displayName_${defaultLocale}`]: 'Color',
      [`displayName_${targetLocale}`]: 'Colore',
    },
    {
      optionId: 2,
      valueId: 4,
      [`displayName_${defaultLocale}`]: '',
      [`displayName_${targetLocale}`]: '',
      [`valueLabel_${defaultLocale}`]: 'Red',
      [`valueLabel_${targetLocale}`]: 'Rosso',
    },
    {
      optionId: 2,
      valueId: 5,
      [`displayName_${defaultLocale}`]: '',
      [`displayName_${targetLocale}`]: '',
      [`valueLabel_${defaultLocale}`]: 'Blue',
      [`valueLabel_${targetLocale}`]: 'Blu',
    },
  ];
}

// Validation helper
export function validateCSVRecord(
  record: SharedOptionTranslationRecord,
  rowNumber: number,
  locale: string
): string[] {
  const errors: string[] = [];

  if (!record.optionId || record.optionId === 0) {
    errors.push(`Row ${rowNumber}: optionId is required`);
  }

  return errors;
}

