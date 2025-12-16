// CSV record type for brand translations
export interface BrandTranslationRecord {
  brandId: number;
  [key: string]: string | number; // Allow dynamic locale-based column names
}

// Helper function to get locale-specific field
export function getLocaleField(record: BrandTranslationRecord, fieldPrefix: string, locale: string): string {
  const key = `${fieldPrefix}_${locale}`;
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

// Helper function to prepare brand translation data for update
export function prepareBrandTranslationData(record: BrandTranslationRecord, locale: string) {
  return {
    brandId: record.brandId,
    fields: [
      {
        fieldName: "name",
        value: getLocaleField(record, 'name', locale),
      },
      {
        fieldName: "page_title",
        value: getLocaleField(record, 'page_title', locale),
      },
      {
        fieldName: "meta_keywords",
        value: getLocaleField(record, 'meta_keywords', locale),
      },
      {
        fieldName: "meta_description",
        value: getLocaleField(record, 'meta_description', locale),
      },
      {
        fieldName: "search_keywords",
        value: getLocaleField(record, 'search_keywords', locale),
      }
    ].filter(field => field.value !== '') // Remove empty fields
  };
}

// Helper function to generate CSV headers for brand translations
export function generateBrandCSVHeaders(defaultLocale: string, targetLocale: string): string[] {
  return [
    'brandId',
    `name_${defaultLocale}`,
    `name_${targetLocale}`,
    `page_title_${defaultLocale}`,
    `page_title_${targetLocale}`,
    `meta_keywords_${defaultLocale}`,
    `meta_keywords_${targetLocale}`,
    `meta_description_${defaultLocale}`,
    `meta_description_${targetLocale}`,
    `search_keywords_${defaultLocale}`,
    `search_keywords_${targetLocale}`,
  ];
}

// Helper function to format brand data for CSV export
export function formatBrandDataForCSV(
  brandId: string, 
  fields: Array<{ fieldName: string; original: string; translation: string }>,
  defaultLocale: string,
  targetLocale: string
): BrandTranslationRecord {
  // Extract the numeric ID from the format "bc/store/brand/123"
  const numericBrandId = parseInt(brandId.split('/').pop() || '0', 10);
  
  // Create base record with brand ID
  const record: BrandTranslationRecord = {
    brandId: numericBrandId
  };
  
  // Add fields to the record
  fields.forEach(field => {
    record[`${field.fieldName}_${defaultLocale}`] = field.original || '';
    record[`${field.fieldName}_${targetLocale}`] = field.translation || '';
  });
  
  return record;
}

