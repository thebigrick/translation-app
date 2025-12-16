import { NextRequest } from "next/server";
import { dbClient as db } from "@/lib/db";
import { put, del } from "@vercel/blob";
import { createGraphQLClient } from "@bigcommerce/translations-graphql-client";
import type { GraphQLClient } from "@bigcommerce/translations-graphql-client";
import {
  formatChannelId,
  formatProductId,
} from "@bigcommerce/translations-graphql-client/src/utils";
import type { TranslationJob } from "@/lib/db/clients/types";
import {
  createRestClient,
  BigCommerceRestClient,
} from "@bigcommerce/translations-rest-client";
import { getSessionFromContext } from "@/lib/auth";
import crypto from "crypto";
import Papa, { ParseResult, ParseError, UnparseConfig } from "papaparse";
import { fallbackLocale } from "@/lib/constants";
import {
  getBasicInformationFieldsToRemove,
  getSeoInformationFieldsToRemove,
  getStorefrontDetailsFieldsToRemove,
  getPreOrderSettingsFieldsToRemove,
  getCustomFieldsToRemove,
} from "@/lib/utils/product-mutation-helpers";
import { logTranslationError } from "@/lib/db";
import {
  CategoryTranslationRecord,
  prepareCategoryTranslationData,
  generateCategoryCSVHeaders,
  formatCategoryDataForCSV,
} from "@/lib/utils/category-translation-helpers";
import {
  BrandTranslationRecord,
  prepareBrandTranslationData,
  generateBrandCSVHeaders,
  formatBrandDataForCSV,
} from "@/lib/utils/brand-translation-helpers";
import {
  EmailTemplateTranslationRecord,
  prepareEmailTemplateTranslationData,
  generateEmailTemplateCSVHeaders,
  formatEmailTemplateDataForCSV,
  getTemplateTypeDisplayName,
  extractTranslationKeys,
} from "@/lib/utils/email-template-helpers";
import {
  SharedModifierTranslationRecord,
  validateCSVRecord,
  prepareSharedModifierTranslationData,
  generateSharedModifierCSVHeaders,
  formatSharedModifierForCSV,
} from "@/lib/utils/shared-modifier-helpers";
import {
  SharedOptionTranslationRecord,
  validateCSVRecord as validateOptionCSVRecord,
  prepareSharedOptionTranslationData,
  generateSharedOptionCSVHeaders,
  formatSharedOptionForCSV,
} from "@/lib/utils/shared-option-helpers";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

// CSV record type
interface TranslationRecord {
  productId: number;
  [key: string]: string | number; // Allow dynamic locale-based column names
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Helper function to get locale-specific field for products
function getLocaleField(
  record: TranslationRecord | CategoryTranslationRecord,
  fieldPrefix: string,
  locale: string
): string {
  const key = `${fieldPrefix}_${locale}`;
  const value = record[key];
  return typeof value === "string" ? value : "";
}

// Helper function to prepare product data for update
function prepareProductData(
  record: TranslationRecord,
  locale: string,
  channelId: number
) {
  const getValue = (value: string, shouldParseJson: boolean = false) => {
    if (!shouldParseJson) return value;
    // Only try to parse JSON for fields that should be JSON
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  };

  // Helper to transform options data structure
  const transformOptionsData = (options: any[]) => {
    if (!Array.isArray(options)) return [];

    return options.map((option) => ({
      optionId: option.id, // Transform id to optionId
      data: {
        dropdown: {
          displayName: option.displayName,
          values:
            option.values?.map((value: any) => ({
              valueId: value.id, // Transform id to valueId
              label: value.label,
            })) || [],
        },
      },
    }));
  };

  // Helper to transform modifiers data structure
  const transformModifiersData = (modifiers: any[]) => {
    if (!Array.isArray(modifiers)) return [];

    return modifiers.map((modifier) => {
      const baseData = {
        modifierId: modifier.id, // Transform id to modifierId
        data: {
          displayName: modifier.displayName,
        },
      };

      // Handle different modifier types based on the type field
      const type = modifier.type as
        | "CheckboxProductModifier"
        | "TextFieldProductModifier"
        | "MultilineTextFieldProductModifier"
        | "NumbersOnlyTextFieldProductModifier"
        | "DropdownProductModifier"
        | "RadioButtonsProductModifier"
        | "RectangleListProductModifier"
        | "SwatchProductModifier"
        | "PickListProductModifier";

      switch (type) {
        case "CheckboxProductModifier":
          return {
            ...baseData,
            data: {
              ...baseData.data,
              checkbox: {
                fieldValue: modifier.fieldValue,
              },
            },
          };
        case "TextFieldProductModifier":
        case "MultilineTextFieldProductModifier":
          return {
            ...baseData,
            data: {
              ...baseData.data,
              [type === "TextFieldProductModifier"
                ? "textField"
                : "multiLineTextField"]: {
                defaultValue: modifier.defaultValue,
              },
            },
          };
        case "NumbersOnlyTextFieldProductModifier":
          return {
            ...baseData,
            data: {
              ...baseData.data,
              numberField: {
                defaultValue: modifier.defaultValue,
              },
            },
          };
        case "DropdownProductModifier":
        case "RadioButtonsProductModifier":
        case "RectangleListProductModifier":
        case "SwatchProductModifier":
        case "PickListProductModifier":
          const typeKey = {
            DropdownProductModifier: "dropdown",
            RadioButtonsProductModifier: "radioButtons",
            RectangleListProductModifier: "rectangleList",
            SwatchProductModifier: "swatch",
            PickListProductModifier: "pickList",
          }[type] as
            | "dropdown"
            | "radioButtons"
            | "rectangleList"
            | "swatch"
            | "pickList";

          return {
            ...baseData,
            data: {
              ...baseData.data,
              [typeKey]: {
                values:
                  modifier.values?.map((value: any) => ({
                    valueId: value.id, // Transform id to valueId
                    label: value.label,
                  })) || [],
              },
            },
          };
        default:
          return baseData;
      }
    });
  };

  // Helper to transform custom fields data structure
  const transformCustomFieldsData = (
    customFields: any[],
    channelId: string,
    locale: string
  ) => {
    if (!Array.isArray(customFields)) return [];

    const formattedChannelId = formatChannelId(channelId);

    return customFields.map((field) => ({
      customFieldId: field.id,
      overrides: [
        {
          channelLocaleOverrides: {
            context: {
              channelId: formattedChannelId,
              locale: locale,
            },
            data: {
              name: field.name || null,
              value: field.value || null,
            },
          },
        },
      ],
    }));
  };

  return {
    // Basic Information - Don't parse as JSON
    name: getValue(getLocaleField(record, "name", locale)),
    description: getValue(getLocaleField(record, "description", locale)),

    // SEO Information - Don't parse as JSON
    pageTitle: getValue(getLocaleField(record, "pageTitle", locale)),
    metaDescription: getValue(
      getLocaleField(record, "metaDescription", locale)
    ),

    // Storefront Details - Don't parse as JSON
    warranty: getValue(getLocaleField(record, "warranty", locale)),
    availabilityDescription: getValue(
      getLocaleField(record, "availabilityDescription", locale)
    ),
    searchKeywords: getValue(getLocaleField(record, "searchKeywords", locale)),

    // Pre-order Settings - Don't parse as JSON
    preOrderMessage: getValue(
      getLocaleField(record, "preOrderMessage", locale)
    ),

    // Complex Data - Parse as JSON and transform
    options: transformOptionsData(
      getValue(getLocaleField(record, "options", locale), true)
    ),
    modifiers: transformModifiersData(
      getValue(getLocaleField(record, "modifiers", locale), true)
    ),
    customFields: transformCustomFieldsData(
      getValue(getLocaleField(record, "customFields", locale), true),
      channelId.toString(),
      locale
    ),
  };
}

// Helper function to parse CSV using PapaParse
async function parseCSV<T>(text: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(text, {
      header: true,
      skipEmptyLines: "greedy",
      delimiter: ",",
      quoteChar: '"',
      escapeChar: '"',
      transformHeader: (header) => header.trim(),
      transform: (value: string, field: string) => {
        const trimmed = value.trim();

        // Transform ID fields to number (but not templateName which is a string)
        if (
          field === "productId" ||
          field === "categoryId" ||
          field === "brandId" ||
          field === "modifierId" ||
          field === "valueId"
        ) {
          if (trimmed === "") {
            return undefined;
          }

          const parsed = parseInt(trimmed, 10);
          if (isNaN(parsed)) {
            throw new Error(`Invalid ID in CSV for field ${field}: ${value}`);
          }
          return parsed;
        }

        // templateName is a string, not a number
        if (field === "templateName") {
          return trimmed || undefined;
        }

        return trimmed;
      },
      complete: (results: ParseResult<T>) => {
        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          reject(
            new Error(
              "Failed to parse CSV: " +
                results.errors.map((e) => e.message).join(", ")
            )
          );
          return;
        }
        if (!results.data.length) {
          reject(new Error("CSV file is empty"));
          return;
        }
        resolve(results.data);
      },
      error: (error: Error) => {
        console.error("CSV parsing error:", error);
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
    });
  });
}

// Helper function to stringify CSV using PapaParse
function stringifyCSV(
  records: TranslationRecord[],
  defaultLocale: string,
  targetLocale: string
): string {
  const headers = [
    "productId",
    // Basic Information
    `name_${defaultLocale}`,
    `name_${targetLocale}`,
    `description_${defaultLocale}`,
    `description_${targetLocale}`,
    // SEO Information
    `pageTitle_${defaultLocale}`,
    `pageTitle_${targetLocale}`,
    `metaDescription_${defaultLocale}`,
    `metaDescription_${targetLocale}`,
    // Storefront Details
    `warranty_${defaultLocale}`,
    `warranty_${targetLocale}`,
    `availabilityDescription_${defaultLocale}`,
    `availabilityDescription_${targetLocale}`,
    `searchKeywords_${defaultLocale}`,
    `searchKeywords_${targetLocale}`,
    // Pre-order Settings
    `preOrderMessage_${defaultLocale}`,
    `preOrderMessage_${targetLocale}`,
    // Options
    `options_${defaultLocale}`,
    `options_${targetLocale}`,
    // Modifiers
    `modifiers_${defaultLocale}`,
    `modifiers_${targetLocale}`,
    // Custom Fields
    `customFields_${defaultLocale}`,
    `customFields_${targetLocale}`,
  ];

  const config: UnparseConfig = {
    quotes: true,
    quoteChar: '"',
    escapeChar: '"',
    delimiter: ",",
    header: true,
    newline: "\n",
    skipEmptyLines: true,
  };

  try {
    const csvData = records.map((record) => {
      const row: Record<string, any> = {};
      headers.forEach((header) => {
        // Handle null/undefined values
        const value = record[header];
        row[header] = value === null || value === undefined ? "" : value;
      });
      return row;
    });

    return Papa.unparse(
      {
        fields: headers,
        data: csvData,
      },
      config
    );
  } catch (error) {
    console.error("Error generating CSV:", error);
    throw new Error("Failed to generate CSV file");
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Configuration from environment variables with defaults
const CONFIG = {
  // Concurrent requests settings (separate for export and import)
  CONCURRENT_REQUESTS_EXPORT: Number(process.env.TRANSLATION_CONCURRENT_REQUESTS_EXPORT) || Number(process.env.TRANSLATION_CONCURRENT_REQUESTS) || 10,
  CONCURRENT_REQUESTS_IMPORT: Number(process.env.TRANSLATION_CONCURRENT_REQUESTS_IMPORT) || Number(process.env.TRANSLATION_CONCURRENT_REQUESTS) || 10,

  // Pagination settings
  PRODUCTS_PER_PAGE: Number(process.env.TRANSLATION_PRODUCTS_PER_PAGE) || 50,
  CATEGORIES_PER_PAGE: Number(process.env.TRANSLATION_CATEGORIES_PER_PAGE) || 50,
  BRANDS_PER_PAGE: Number(process.env.TRANSLATION_BRANDS_PER_PAGE) || 50,
  EMAIL_TEMPLATES_PER_PAGE: Number(process.env.TRANSLATION_EMAIL_TEMPLATES_PER_PAGE) || 50,
  SHARED_MODIFIERS_PER_PAGE: Number(process.env.TRANSLATION_SHARED_MODIFIERS_PER_PAGE) || 50,
  SHARED_OPTIONS_PER_PAGE: Number(process.env.TRANSLATION_SHARED_OPTIONS_PER_PAGE) || 50,

  // Batch processing settings (for progress logging)
  IMPORT_BATCH_SIZE: Number(process.env.TRANSLATION_IMPORT_BATCH_SIZE) || 10,
  EXPORT_BATCH_SIZE: Number(process.env.TRANSLATION_EXPORT_BATCH_SIZE) || 100,

  // Delay settings (in milliseconds) - used for pagination in export jobs
  MIN_DELAY_BETWEEN_PAGES: Number(process.env.TRANSLATION_PAGE_DELAY_MS) || 200,

  // Chunk processing settings
  MAX_PRODUCTS_PER_EXPORT_CHUNK: Number(process.env.TRANSLATION_MAX_PRODUCTS_PER_EXPORT_CHUNK) || 1000,
  MAX_PRODUCTS_PER_IMPORT_CHUNK: Number(process.env.TRANSLATION_MAX_PRODUCTS_PER_IMPORT_CHUNK) || 500,
};

// Validate configuration
Object.entries(CONFIG).forEach(([key, value]) => {
  if (typeof value !== "number" || value <= 0) {
    throw new Error(
      `Invalid configuration for ${key}: ${value}. Must be a positive number.`
    );
  }
});

// ============================================================================
// CSV HELPERS
// ============================================================================

// Helper function to fetch and parse CSV file
async function fetchAndParseCSV<T>(fileUrl: string): Promise<T[]> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV file: ${response.statusText}`);
  }
  const csvContent = await response.text();
  return parseCSV<T>(csvContent);
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function verifyAuthorization(request: NextRequest) {
  // Check for Authorization header (secret)
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const [type, token] = authHeader.split(" ");
    if (type === "Bearer" && token === process.env.CRON_SECRET) {
      return { type: "cron" as const };
    }
  }

  // Check for context parameter
  const context = request.nextUrl.searchParams.get("context");
  if (context) {
    try {
      const session = await getSessionFromContext(context);
      return { type: "user" as const, storeHash: session.storeHash };
    } catch (error) {
      console.error("Invalid context:", error);
    }
  }

  throw new Error(
    "Unauthorized: Valid authorization header or context required"
  );
}

// ============================================================================
// PRODUCT IMPORT HELPERS
// ============================================================================

// Interface for the mutation variables
interface ProductLocaleUpdateVariables {
  channelId: string;
  locale: string;
  input: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    data: {
      name: string;
      description: string;
    };
  };
  seoInput: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    data: {
      pageTitle: string;
      metaDescription: string;
    };
  };
  preOrderInput: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    data: {
      message: string;
    };
  };
  storefrontInput: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    data: {
      warranty: string;
      availabilityDescription: string;
      searchKeywords: string;
    };
  };
  optionsInput?: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    data: {
      options: any[];
    };
  };
  modifiersInput?: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    data: {
      modifiers: any[];
    };
  };
  customFieldsInput?: {
    productId: string;
    data: any[];
  };
  removedBasicInfoInput?: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    overridesToRemove: string[];
  };
  removedSeoInput?: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    overridesToRemove: string[];
  };
  removedStorefrontDetailsInput?: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    overridesToRemove: string[];
  };
  removedPreOrderInput?: {
    productId: string;
    localeContext: {
      channelId: string;
      locale: string;
    };
    overridesToRemove: string[];
  };
  removedCustomFieldsInput?: {
    productId: string;
    data: any[];
  };
}

// Helper function to process a single product import record
async function processImportRecord(
  record: TranslationRecord,
  job: TranslationJob,
  graphqlClient: GraphQLClient
): Promise<void> {

  const productData = prepareProductData(
    record,
    job.locale,
    job.channelId
  );

  // Format IDs for GraphQL
  const formattedChannelId = formatChannelId(job.channelId);
  const formattedProductId = formatProductId(record.productId);

  // Get fields to remove based on empty values
  const basicInfoFieldsToRemove = getBasicInformationFieldsToRemove({
    name: productData.name,
    description: productData.description,
  });

  const seoFieldsToRemove = getSeoInformationFieldsToRemove({
    pageTitle: productData.pageTitle,
    metaDescription: productData.metaDescription,
  });

  const storefrontFieldsToRemove = getStorefrontDetailsFieldsToRemove({
    warranty: productData.warranty,
    availabilityDescription: productData.availabilityDescription,
    searchKeywords: productData.searchKeywords,
  });

  const preOrderFieldsToRemove = getPreOrderSettingsFieldsToRemove({
    preOrderMessage: productData.preOrderMessage,
  });

  const customFieldsToRemove = getCustomFieldsToRemove({
    customFields: productData.customFields.reduce(
      (acc: any, field: any) => {
        if (field.customFieldId) {
          acc[field.customFieldId] = {
            name: field.overrides?.[0]?.channelLocaleOverrides?.data?.name,
            value:
              field.overrides?.[0]?.channelLocaleOverrides?.data?.value,
          };
        }
        return acc;
      },
      {}
    ),
  });

  // Prepare input variables for the mutation
  const variables: ProductLocaleUpdateVariables = {
    channelId: formattedChannelId,
    locale: job.locale,

    // Basic Information
    input: {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      data: {
        name: productData.name,
        description: productData.description,
      },
    },

    // SEO Information
    seoInput: {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      data: {
        pageTitle: productData.pageTitle,
        metaDescription: productData.metaDescription,
      },
    },

    // Pre-order Settings
    preOrderInput: {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      data: {
        message: productData.preOrderMessage,
      },
    },

    // Storefront Details
    storefrontInput: {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      data: {
        warranty: productData.warranty,
        availabilityDescription: productData.availabilityDescription,
        searchKeywords: productData.searchKeywords,
      },
    },
  };

  // Add options if present
  if (productData.options?.length > 0) {
    variables.optionsInput = {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      data: {
        options: productData.options,
      },
    };
  }

  // Add modifiers if present
  if (productData.modifiers?.length > 0) {
    variables.modifiersInput = {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      data: { modifiers: productData.modifiers },
    };
  }

  // Add custom fields if present
  if (productData.customFields?.length > 0) {
    variables.customFieldsInput = {
      productId: formattedProductId,
      data: productData.customFields,
    };
  }

  // Add removal inputs for fields that should be removed
  if (basicInfoFieldsToRemove.length > 0) {
    variables.removedBasicInfoInput = {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      overridesToRemove: basicInfoFieldsToRemove,
    };
  }

  if (seoFieldsToRemove.length > 0) {
    variables.removedSeoInput = {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      overridesToRemove: seoFieldsToRemove,
    };
  }

  if (storefrontFieldsToRemove.length > 0) {
    variables.removedStorefrontDetailsInput = {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      overridesToRemove: storefrontFieldsToRemove,
    };
  }

  if (preOrderFieldsToRemove.length > 0) {
    variables.removedPreOrderInput = {
      productId: formattedProductId,
      localeContext: {
        channelId: formattedChannelId,
        locale: job.locale,
      },
      overridesToRemove: preOrderFieldsToRemove,
    };
  }

  if (customFieldsToRemove.length > 0) {
    variables.removedCustomFieldsInput = {
      productId: formattedProductId,
      data: customFieldsToRemove.map((field) => ({
        customFieldId: field.customFieldId,
        channelLocaleContextData: {
          context: {
            channelId: formattedChannelId,
            locale: job.locale,
          },
          attributes: field.fields,
        },
      })),
    };
  }

  // Call the mutation with retry logic (same as export)
  await updateProductLocaleDataWithRetry(variables, graphqlClient, record.productId);
}

// Helper function to update product locale data with retry logic
async function updateProductLocaleDataWithRetry(
  variables: ProductLocaleUpdateVariables,
  graphqlClient: GraphQLClient,
  productId: number,
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await graphqlClient.NOTADA_updateProductLocaleData(variables);
      return;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        console.log(
          `[Import] Error updating product ${productId} (attempt ${attempt}/${maxRetries}), retrying after 100ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        console.error(
          `[Import] Failed to update product ${productId} after ${maxRetries} attempts:`,
          lastError
        );
        throw lastError;
      }
    }
  }
  
  throw lastError || new Error(`Failed to update product ${productId} after ${maxRetries} attempts`);
}

// ============================================================================
// JOB PROCESSORS
// ============================================================================

// Process an import job with chunking support
async function processImportJob(
  job: TranslationJob,
  graphqlClient: GraphQLClient
) {
  console.log(
    `[Import] Starting import job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    if (!job.fileUrl) {
      throw new Error("No file URL provided for import job");
    }

    // Get store token and create REST client
    const accessToken = await db.getStoreToken(job.storeHash);
    if (!accessToken) {
      throw new Error("Store token not found");
    }
    const restClient = createRestClient({
      accessToken,
      storeHash: job.storeHash,
    });

    // Fetch channel locales to get default locale
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(`[Import] Using default locale: ${defaultLocale}`);

    // Check if this is a chunked import in progress
    const chunkMetadata = getImportChunkMetadata(job);
    
    let allRecords: TranslationRecord[];
    let processedProducts: number;

    // Fetch and parse CSV file
    if (chunkMetadata && !chunkMetadata.isComplete) {
      // Continue from existing chunk
      console.log(
        `[Import] Resuming chunked import: processed ${chunkMetadata.processedProducts} of ${chunkMetadata.totalProducts} products`
      );
      allRecords = await fetchAndParseCSV<TranslationRecord>(job.fileUrl!);
      processedProducts = chunkMetadata.processedProducts;
    } else {
      // Start new chunked import
      console.log(`[Import] Starting new chunked import`);
      console.log("[Import] Parsing CSV content");
      allRecords = await fetchAndParseCSV<TranslationRecord>(job.fileUrl!);
      console.log(`[Import] Found ${allRecords.length} records to import`);
      processedProducts = 0;
    }

    // Calculate chunk boundaries - process ONLY ONE chunk per cron execution
    // This ensures we don't exceed Vercel timeout limits
    const chunkStart = processedProducts;
    const chunkEnd = Math.min(
      chunkStart + CONFIG.MAX_PRODUCTS_PER_IMPORT_CHUNK,
      allRecords.length
    );
    const chunkRecords = allRecords.slice(chunkStart, chunkEnd);
    
    // Calculate chunk index and total chunks for progress display (same model as export)
    const totalChunks = Math.ceil(allRecords.length / CONFIG.MAX_PRODUCTS_PER_IMPORT_CHUNK);
    const currentChunkIndex = Math.floor(processedProducts / CONFIG.MAX_PRODUCTS_PER_IMPORT_CHUNK);

    console.log(
      `[Import] Starting to process chunk: products ${chunkStart + 1}-${chunkEnd} of ${allRecords.length} - ONE CHUNK PER CRON EXECUTION`
    );
    console.log(
      `[Import] Processing with ${CONFIG.CONCURRENT_REQUESTS_IMPORT} concurrent requests, retry on error (max 3 attempts, 100ms delay)`
    );

    // Process records in batches with progress logging
    const batchSize = CONFIG.CONCURRENT_REQUESTS_IMPORT;
    const progressInterval = CONFIG.IMPORT_BATCH_SIZE;
    let processedCount = 0;
    const errors: Error[] = [];

    // Process items in batches
    for (let i = 0; i < chunkRecords.length; i += batchSize) {
      const batch = chunkRecords.slice(i, i + batchSize);

      // Process batch concurrently
      const batchResults = await Promise.allSettled(
        batch.map(async (record: TranslationRecord) => {
          try {
            await processImportRecord(record, job, graphqlClient);
          } catch (error) {
            console.error(
              `[Import] Error updating product ${record.productId}:`,
              error
            );
            const errorWithResponse = error as Error & {
              response?: any;
              errors?: any;
            };
            await logTranslationError({
              jobId: job.id,
              entityId: record.productId,
              lineNumber: 0,
              errorType: "api_error",
              errorMessage: errorWithResponse.message,
              rawData: JSON.stringify({
                record,
                response: errorWithResponse.errors,
              }),
            });
            throw error;
          }
        })
      );

      // Handle results and errors
      batchResults.forEach((result) => {
        if (result.status === "fulfilled") {
          processedCount++;
        } else {
          errors.push(result.reason);
          processedCount++;
        }
      });

      // Log progress every N products
      if (processedCount % progressInterval === 0 || processedCount === chunkRecords.length) {
        const percentage = Math.round((processedCount / chunkRecords.length) * 100);
        console.log(
          `[Import] Progress: ${processedCount}/${chunkRecords.length} products processed (${percentage}%)`
        );
      }
    }

    if (errors.length > 0) {
      console.warn(
        `[Import] Completed with ${errors.length} errors out of ${chunkRecords.length} products`
      );
    }

    console.log(
      `[Import] Completed processing chunk: ${chunkRecords.length} products processed (${chunkStart + 1}-${chunkEnd} of ${allRecords.length})`
    );

    const newProcessedProducts = chunkEnd;
    const isComplete = newProcessedProducts >= allRecords.length;

    if (isComplete) {
      console.log(`[Import] Job ${job.id} completed successfully`);
      
      // Update job metadata to mark as complete
      await db.updateTranslationJob(job.id, {
        metadata: {
          chunkIndex: totalChunks - 1, // Last chunk index (0-based)
          totalChunks,
          processedProducts: newProcessedProducts,
          totalProducts: allRecords.length,
          isComplete: true,
        } as ImportChunkMetadata,
      });
    } else {
      // Update job metadata for next chunk - use same model as export
      await db.updateTranslationJob(job.id, {
        status: "pending", // Keep as pending so next cron picks it up
        metadata: {
          chunkIndex: currentChunkIndex, // Current chunk index (0-based)
          totalChunks,
          processedProducts: newProcessedProducts,
          totalProducts: allRecords.length,
          isComplete: false,
        } as ImportChunkMetadata,
      });

      console.log(
        `[Import] Chunk completed. Processed ${newProcessedProducts} of ${allRecords.length} products. Job will be picked up by next cron.`
      );
    }
  } catch (error) {
    console.error("[Import] Job failed:", error);
    throw error;
  }
}

// ============================================================================
// PRODUCT EXPORT HELPERS
// ============================================================================

// Helper function to format options data for export
function formatOptionsData(options: any) {
  if (!options?.edges) return [];

  return options.edges.map((edge: any) => {
    const node = edge.node;
    return {
      id: node.id,
      displayName: node.displayName,
      values: node.values?.map((value: any) => ({
        id: value.id,
        label: value.label,
      })),
    };
  });
}

// Helper function to format modifiers data
function formatModifiersData(modifiers: any) {
  if (!modifiers?.edges) return "";

  return modifiers.edges.map((edge: any) => {
    const node = edge.node;
    const baseData = {
      id: node.id,
      displayName: node.displayName,
      type: node.__typename,
    };

    // Handle different modifier types
    switch (node.__typename) {
      case "CheckboxProductModifier":
        return {
          ...baseData,
          fieldValue: node.fieldValue,
        };
      case "TextFieldProductModifier":
      case "MultilineTextFieldProductModifier":
        return {
          ...baseData,
          defaultValue: node.defaultValue,
        };
      case "NumbersOnlyTextFieldProductModifier":
        return {
          ...baseData,
          defaultValue: node.defaultValueFloat,
        };
      case "DropdownProductModifier":
      case "RadioButtonsProductModifier":
      case "RectangleListProductModifier":
      case "SwatchProductModifier":
      case "PickListProductModifier":
        return {
          ...baseData,
          values: node.values?.map((value: any) => ({
            id: value.id,
            label: value.label,
          })),
        };
      default:
        return baseData;
    }
  });
}

// Helper function to format custom fields data
function formatCustomFieldsData(customFields: any) {
  if (!customFields?.edges) return "";

  return customFields.edges.map((edge: any) => {
    const node = edge.node;
    return {
      id: node.id,
      name: node.name,
      value: node.value,
    };
  });
}

// Helper to generate a unique filename for exports with resource type
function generateUniqueExportFilename(
  jobId: number,
  storeHash: string,
  locale: string,
  channelName: string,
  resourceType: string = "products"
): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(8).toString("hex");
  // Sanitize the channel name to remove any potentially unsafe characters
  const sanitizedChannelName = channelName.replace(/[^a-zA-Z0-9.-]/g, "_");
  // Create a descriptive filename that includes job ID, channel, locale, and resource type
  const descriptiveFilename = `${jobId}-${sanitizedChannelName}-${locale}-${resourceType}.csv`;
  return `exports/${storeHash}/${timestamp}-${randomBytes}-${descriptiveFilename}`;
}

// Helper to generate a unique filename for partial CSV chunks
function generatePartialChunkFilename(
  jobId: number,
  storeHash: string,
  locale: string,
  channelName: string,
  chunkIndex: number,
  resourceType: string = "products"
): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(8).toString("hex");
  const sanitizedChannelName = channelName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const descriptiveFilename = `${jobId}-${sanitizedChannelName}-${locale}-${resourceType}-chunk-${chunkIndex}.csv`;
  return `exports/${storeHash}/chunks/${timestamp}-${randomBytes}-${descriptiveFilename}`;
}

// ============================================================================
// CHUNKING HELPERS
// ============================================================================

// Types for chunk metadata
interface ExportChunkMetadata {
  chunkIndex: number;
  totalChunks: number;
  processedProducts: number;
  totalProducts: number;
  partialCsvUrls: string[];
  isComplete: boolean;
}

interface ImportChunkMetadata {
  chunkIndex?: number; // Chunk index (0-based) for consistency with export
  totalChunks?: number; // Total number of chunks for consistency with export
  processedProducts: number;
  totalProducts: number;
  isComplete: boolean;
}

// Helper to get chunk metadata from job
function getExportChunkMetadata(job: TranslationJob): ExportChunkMetadata | null {
  if (!job.metadata || typeof job.metadata !== 'object') {
    return null;
  }
  const metadata = job.metadata as any;
  if (metadata.chunkIndex !== undefined) {
    return metadata as ExportChunkMetadata;
  }
  return null;
}

function getImportChunkMetadata(job: TranslationJob): ImportChunkMetadata | null {
  if (!job.metadata || typeof job.metadata !== 'object') {
    return null;
  }
  const metadata = job.metadata as any;
  if (metadata.processedProducts !== undefined) {
    return metadata as ImportChunkMetadata;
  }
  return null;
}

// Helper to combine multiple CSV files into one
async function combineCsvFiles(
  csvUrls: string[],
  defaultLocale: string,
  targetLocale: string
): Promise<string> {
  if (csvUrls.length === 0) {
    throw new Error("No CSV files to combine");
  }

  const allRecords: TranslationRecord[] = [];

  for (const url of csvUrls) {
    const records = await fetchAndParseCSV<TranslationRecord>(url);
    allRecords.push(...records);
  }

  // Generate combined CSV with same format as original
  return stringifyCSV(allRecords, defaultLocale, targetLocale);
}

// Helper function to process a single chunk of products for export
async function processProductChunk(
  productAssignments: { channel_id: number; product_id: number }[],
  job: TranslationJob,
  graphqlClient: GraphQLClient,
  defaultLocale: string
): Promise<TranslationRecord[]> {
  console.log(
    `[Export] Starting to process chunk of ${productAssignments.length} products`
  );
  console.log(
    `[Export] Processing with ${CONFIG.CONCURRENT_REQUESTS_EXPORT} concurrent requests, retry on error (max 3 attempts, 100ms delay)`
  );

  const results: TranslationRecord[] = [];
  const errors: Error[] = [];
  const batchSize = CONFIG.CONCURRENT_REQUESTS_EXPORT;
  // Log progress every 100 products (or use EXPORT_BATCH_SIZE if >= 100)
  const progressInterval = CONFIG.EXPORT_BATCH_SIZE >= 100 ? CONFIG.EXPORT_BATCH_SIZE : 100;
  let processedCount = 0;

  // Helper function to fetch product translation with retry logic
  async function fetchProductTranslationWithRetry(
    productId: number,
    maxRetries: number = 3
  ): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const translation = await graphqlClient.getProductLocaleData({
          pid: productId,
          channelId: job.channelId,
          locale: job.locale,
          availableLocales: [{ code: job.locale }],
          defaultLocale: defaultLocale,
        });
        return translation;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          console.log(
            `[Export] Error fetching product ${productId} (attempt ${attempt}/${maxRetries}), retrying after 100ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          console.error(
            `[Export] Failed to fetch product ${productId} after ${maxRetries} attempts:`,
            lastError
          );
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error(`Failed to fetch product ${productId} after ${maxRetries} attempts`);
  }

  // Process items in batches with progress logging
  for (let i = 0; i < productAssignments.length; i += batchSize) {
    const batch = productAssignments.slice(i, i + batchSize);

    // Process batch concurrently
    const batchResults = await Promise.allSettled(
      batch.map(async (assignment: { channel_id: number; product_id: number }) => {
      const productId = assignment.product_id;

      try {
        const translation = await fetchProductTranslationWithRetry(productId);

          const productNode = translation;
          const localeNode = productNode.overridesForLocale;

          const options = productNode?.options?.edges;
          const modifiers = productNode?.modifiers?.edges;
          const customFields = productNode?.customFields?.edges;

          return {
            productId: productId,
            // Basic Information
            [`name_${defaultLocale}`]:
              productNode?.basicInformation?.name || "",
            [`name_${job.locale}`]: localeNode?.basicInformation?.name || "",
            [`description_${defaultLocale}`]:
              productNode?.basicInformation?.description || "",
            [`description_${job.locale}`]:
              localeNode?.basicInformation?.description || "",

            // SEO Information
            [`pageTitle_${defaultLocale}`]:
              productNode?.seoInformation?.pageTitle || "",
            [`pageTitle_${job.locale}`]:
              localeNode?.seoInformation?.pageTitle || "",
            [`metaDescription_${defaultLocale}`]:
              productNode?.seoInformation?.metaDescription || "",
            [`metaDescription_${job.locale}`]:
              localeNode?.seoInformation?.metaDescription || "",

            // Storefront Details
            [`warranty_${defaultLocale}`]:
              productNode?.storefrontDetails?.warranty || "",
            [`warranty_${job.locale}`]:
              localeNode?.storefrontDetails?.warranty || "",
            [`availabilityDescription_${defaultLocale}`]:
              productNode?.storefrontDetails?.availabilityDescription || "",
            [`availabilityDescription_${job.locale}`]:
              localeNode?.storefrontDetails?.availabilityDescription || "",
            [`searchKeywords_${defaultLocale}`]:
              productNode?.storefrontDetails?.searchKeywords || "",
            [`searchKeywords_${job.locale}`]:
              localeNode?.storefrontDetails?.searchKeywords || "",

            // Pre-order Settings
            [`preOrderMessage_${defaultLocale}`]:
              productNode?.preOrderSettings?.message || "",
            [`preOrderMessage_${job.locale}`]:
              localeNode?.preOrderSettings?.message || "",

            // Options
            [`options_${defaultLocale}`]: JSON.stringify(
              formatOptionsData(productNode?.options)
            ),
            [`options_${job.locale}`]: JSON.stringify(
              formatOptionsData(options)
            ),

            // Modifiers
            [`modifiers_${defaultLocale}`]: JSON.stringify(
              formatModifiersData(productNode?.modifiers)
            ),
            [`modifiers_${job.locale}`]: JSON.stringify(
              formatModifiersData(modifiers)
            ),

            // Custom Fields
            [`customFields_${defaultLocale}`]: JSON.stringify(
              formatCustomFieldsData(productNode?.customFields)
            ),
            [`customFields_${job.locale}`]: JSON.stringify(
              formatCustomFieldsData(customFields)
            ),
          };
        } catch (error) {
          console.error(
            `[Export] Error fetching translation for product ${productId}:`,
            error
          );
          const errorWithResponse = error as Error & { response?: any };
          await logTranslationError({
            jobId: job.id,
            entityId: productId,
            lineNumber: 0,
            errorType: "api_error",
            errorMessage: errorWithResponse.message,
            rawData: JSON.stringify({
              productId,
              response: errorWithResponse.response,
            }),
          });
          return {
            productId: productId,
            [`name_${defaultLocale}`]: "",
            [`name_${job.locale}`]: "",
            [`description_${defaultLocale}`]: "",
            [`description_${job.locale}`]: "",
            [`pageTitle_${defaultLocale}`]: "",
            [`pageTitle_${job.locale}`]: "",
            [`metaDescription_${defaultLocale}`]: "",
            [`metaDescription_${job.locale}`]: "",
            [`warranty_${defaultLocale}`]: "",
            [`warranty_${job.locale}`]: "",
            [`availabilityDescription_${defaultLocale}`]: "",
            [`availabilityDescription_${job.locale}`]: "",
            [`searchKeywords_${defaultLocale}`]: "",
            [`searchKeywords_${job.locale}`]: "",
            [`preOrderMessage_${defaultLocale}`]: "",
            [`preOrderMessage_${job.locale}`]: "",
            [`options_${defaultLocale}`]: "",
            [`options_${job.locale}`]: "",
            [`modifiers_${defaultLocale}`]: "",
            [`modifiers_${job.locale}`]: "",
            [`customFields_${defaultLocale}`]: "",
            [`customFields_${job.locale}`]: "",
          };
        }
      })
    );

    // Handle results and errors
    batchResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
        processedCount++;
      } else {
        errors.push(result.reason);
        processedCount++;
      }
    });

    // Log progress every N products
    if (processedCount % progressInterval === 0 || processedCount === productAssignments.length) {
      const percentage = Math.round((processedCount / productAssignments.length) * 100);
      console.log(
        `[Export] Progress: ${processedCount}/${productAssignments.length} products processed (${percentage}%)`
      );
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[Export] Completed with ${errors.length} errors out of ${productAssignments.length} products`
    );
  }

  console.log(
    `[Export] Completed processing chunk of ${productAssignments.length} products (${results.length} successfully processed)`
  );

  return results;
}

// Helper function to get product assignments for a specific chunk
// Returns: { assignments, totalProducts, totalPages }
async function getProductAssignmentsChunk(
  channelId: number,
  restClient: BigCommerceRestClient,
  startIndex: number,
  maxProducts: number,
  knownTotal?: number
): Promise<{
  assignments: { channel_id: number; product_id: number }[];
  totalProducts: number;
  totalPages: number;
}> {
  const assignments: any[] = [];
  const limit = CONFIG.PRODUCTS_PER_PAGE;
  
  // Calculate which pages we need to read
  const startPage = Math.floor(startIndex / limit) + 1;
  const endIndex = startIndex + maxProducts;
  const endPage = Math.ceil(endIndex / limit);
  
  let totalProducts: number | undefined = knownTotal;
  let totalPages: number | undefined;

  console.log(
    `[Export] Fetching product assignments for chunk: pages ${startPage}${totalPages ? `-${Math.min(endPage, totalPages)}` : `-${endPage}`} (products ${startIndex + 1} to ${endIndex})`
  );

  for (let page = startPage; page <= endPage; page++) {
    const pageInfo = totalPages !== undefined ? ` of ${totalPages}` : '';
    console.log(`[Export] Reading page ${page}${pageInfo} (${limit} products per page)`);
    
    const productAssignmentsPage = await restClient.getChannelProductAssignments(
      channelId,
      limit,
      page
    ) as {data: any[]; meta?: {pagination?: any}};
    
    const pageAssignments = productAssignmentsPage.data || [];
    
    // Get pagination info from first page
    if (page === startPage) {
      const pagination = productAssignmentsPage.meta?.pagination;
      if (pagination) {
        totalPages = pagination.total_pages || 1;
        totalProducts = pagination.total || pageAssignments.length;
      }
    }
    
    // Calculate which products from this page we need
    const pageStartIndex = (page - 1) * limit;
    const pageEndIndex = pageStartIndex + pageAssignments.length;
    
    // Only add assignments that are in our chunk range
    const chunkStartInPage = Math.max(0, startIndex - pageStartIndex);
    const chunkEndInPage = Math.min(pageAssignments.length, endIndex - pageStartIndex);
    
    if (chunkStartInPage < chunkEndInPage) {
      const neededAssignments = pageAssignments.slice(chunkStartInPage, chunkEndInPage);
      assignments.push(...neededAssignments);
      console.log(
        `[Export] Page ${page} returned ${pageAssignments.length} product assignments, using ${neededAssignments.length} for chunk (chunk total so far: ${assignments.length})`
      );
    } else {
      console.log(`[Export] Page ${page} returned ${pageAssignments.length} product assignments, none needed for this chunk`);
    }
    
    // Stop if we have enough or if we've read all pages
    if (assignments.length >= maxProducts) {
      break;
    }
    
    if (totalPages !== undefined && page >= totalPages) {
      break;
    }
    
    // Delay between pages
    if (page < endPage && (totalPages === undefined || page < totalPages)) {
      await new Promise((resolve) =>
        setTimeout(resolve, CONFIG.MIN_DELAY_BETWEEN_PAGES)
      );
    }
  }

  // If we don't have totalProducts yet, estimate it
  if (totalProducts === undefined) {
    if (totalPages !== undefined) {
      // We can estimate based on pages read
      totalProducts = assignments.length; // Conservative estimate
    } else {
      totalProducts = assignments.length;
    }
  }

  console.log(
    `[Export] Completed reading chunk pages. Got ${assignments.length} product assignments${totalProducts !== undefined ? ` (total products: ${totalProducts})` : ''}`
  );

  return {
    assignments: assignments.slice(0, maxProducts), // Ensure we don't exceed maxProducts
    totalProducts: totalProducts || assignments.length,
    totalPages: totalPages || Math.ceil(assignments.length / limit),
  };
}

// Process an export job with chunking support
async function processExportJob(
  job: TranslationJob,
  graphqlClient: GraphQLClient,
  restClient: BigCommerceRestClient
) {
  console.log(
    `[Export] Starting export job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    // Get channel details first
    const channelResponse = await restClient.getChannel(job.channelId);
    const channelName =
      channelResponse.data?.name || `channel-${job.channelId}`;

    // Get channel locales to determine default locale
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(`[Export] Using default locale: ${defaultLocale}`);

    // Check if this is a chunked export in progress
    const chunkMetadata = getExportChunkMetadata(job);
    
    let chunkAssignments: { channel_id: number; product_id: number }[];
    let currentChunkIndex: number;
    let totalChunks: number;
    let totalProducts: number;
    let partialCsvUrls: string[];

    if (chunkMetadata && !chunkMetadata.isComplete) {
      // Continue from existing chunk
      console.log(
        `[Export] Resuming chunked export: chunk ${chunkMetadata.chunkIndex + 1} of ${chunkMetadata.totalChunks}`
      );
      
      currentChunkIndex = chunkMetadata.chunkIndex + 1;
      totalChunks = chunkMetadata.totalChunks;
      totalProducts = chunkMetadata.totalProducts;
      partialCsvUrls = [...chunkMetadata.partialCsvUrls];
      
      // Read only the pages needed for this chunk
      const chunkStart = currentChunkIndex * CONFIG.MAX_PRODUCTS_PER_EXPORT_CHUNK;
      const chunkResult = await getProductAssignmentsChunk(
        job.channelId,
        restClient,
        chunkStart,
        CONFIG.MAX_PRODUCTS_PER_EXPORT_CHUNK,
        totalProducts
      );
      chunkAssignments = chunkResult.assignments;
    } else {
      // Start new chunked export - read only first chunk + get total
      console.log(`[Export] Starting new chunked export`);
      
      currentChunkIndex = 0;
      const chunkStart = 0;
      const chunkResult = await getProductAssignmentsChunk(
        job.channelId,
        restClient,
        chunkStart,
        CONFIG.MAX_PRODUCTS_PER_EXPORT_CHUNK
      );
      
      chunkAssignments = chunkResult.assignments;
      totalProducts = chunkResult.totalProducts;
      totalChunks = Math.ceil(totalProducts / CONFIG.MAX_PRODUCTS_PER_EXPORT_CHUNK);
      partialCsvUrls = [];

      if (!chunkAssignments.length) {
        throw new Error("No products found for export");
      }

      console.log(
        `[Export] Found ${totalProducts} total products (read ${chunkAssignments.length} for first chunk), will process in ${totalChunks} chunks of max ${CONFIG.MAX_PRODUCTS_PER_EXPORT_CHUNK} products each`
      );
    }

    // Process current chunk ONLY - one chunk per cron execution
    // This ensures we don't exceed Vercel timeout limits
    const chunkStart = currentChunkIndex * CONFIG.MAX_PRODUCTS_PER_EXPORT_CHUNK;
    const chunkEnd = Math.min(
      chunkStart + CONFIG.MAX_PRODUCTS_PER_EXPORT_CHUNK,
      totalProducts
    );

    console.log(
      `[Export] Processing chunk ${currentChunkIndex + 1}/${totalChunks} (products ${chunkStart + 1}-${chunkEnd} of ${totalProducts}) - ONE CHUNK PER CRON EXECUTION`
    );

    const translatedProducts = await processProductChunk(
      chunkAssignments,
      job,
      graphqlClient,
      defaultLocale
    );

    // Generate CSV for this chunk
    const csvContent = stringifyCSV(
      translatedProducts,
      defaultLocale,
      job.locale
    );

    // Upload chunk CSV
    const chunkFilename = generatePartialChunkFilename(
      job.id,
      job.storeHash,
      job.locale,
      channelName,
      currentChunkIndex
    );
    const { url: chunkUrl } = await put(chunkFilename, csvContent, {
      access: "public",
      contentType: "text/csv",
      addRandomSuffix: false,
    });

    partialCsvUrls.push(chunkUrl);
    console.log(`[Export] Chunk ${currentChunkIndex + 1} uploaded: ${chunkUrl}`);

    const isLastChunk = currentChunkIndex + 1 >= totalChunks;

    if (isLastChunk) {
      // Combine all chunks into final CSV
      console.log(`[Export] Last chunk completed, combining ${partialCsvUrls.length} chunks into final CSV`);
      
      const finalCsvContent = await combineCsvFiles(
        partialCsvUrls,
        defaultLocale,
        job.locale
      );

      // Upload final CSV
      const finalFilename = generateUniqueExportFilename(
        job.id,
        job.storeHash,
        job.locale,
        channelName
      );
      const { url: finalUrl } = await put(finalFilename, finalCsvContent, {
        access: "public",
        contentType: "text/csv",
        addRandomSuffix: false,
      });

      console.log(`[Export] Final CSV uploaded: ${finalUrl}`);

      // Delete partial chunk files
      console.log(`[Export] Deleting ${partialCsvUrls.length} partial chunk files`);
      for (const chunkUrl of partialCsvUrls) {
        try {
          await del(chunkUrl);
        } catch (error) {
          console.warn(`[Export] Failed to delete chunk file ${chunkUrl}:`, error);
          // Continue even if deletion fails
        }
      }

      // Update job metadata to mark as complete
      await db.updateTranslationJob(job.id, {
        metadata: {
          chunkIndex: currentChunkIndex,
          totalChunks,
          processedProducts: totalProducts,
          totalProducts: totalProducts,
          partialCsvUrls: [],
          isComplete: true,
        } as ExportChunkMetadata,
      });

      return finalUrl;
    } else {
      // Update job metadata for next chunk
      await db.updateTranslationJob(job.id, {
        status: "pending", // Keep as pending so next cron picks it up
        metadata: {
          chunkIndex: currentChunkIndex,
          totalChunks,
          processedProducts: chunkEnd,
          totalProducts: totalProducts,
          partialCsvUrls,
          isComplete: false,
        } as ExportChunkMetadata,
      });

      console.log(
        `[Export] Chunk ${currentChunkIndex + 1} completed. Job will be picked up by next cron for chunk ${currentChunkIndex + 2}`
      );

      // Return null to indicate job is not yet complete
      // IMPORTANT: Only ONE chunk is processed per cron execution to avoid timeout
      return null;
    }
  } catch (error) {
    console.error("[Export] Job failed:", error);
    const errorWithResponse = error as Error & { response?: any };
    await logTranslationError({
      jobId: job.id,
      entityId: 0,
      lineNumber: 0,
      errorType: "export_error",
      errorMessage: errorWithResponse.message,
      rawData: JSON.stringify({
        jobId: job.id,
        response: errorWithResponse.response,
      }),
    });
    throw error;
  }
}

// Process a category import job
async function processCategoryImportJob(
  job: TranslationJob,
  graphqlClient: any
) {
  console.log(
    `[Category Import] Starting import job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    if (!job.fileUrl) {
      throw new Error("No file URL provided for import job");
    }

    // Get store token and create REST client
    const accessToken = await db.getStoreToken(job.storeHash);
    if (!accessToken) {
      throw new Error("Store token not found");
    }
    const restClient = createRestClient({
      accessToken,
      storeHash: job.storeHash,
    });

    // Fetch channel locales to get default locale
    console.log(
      `[Category Import] Fetching channel locales for channel ${job.channelId}`
    );
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(`[Category Import] Using default locale: ${defaultLocale}`);

    // Fetch and parse CSV file
    console.log(`[Category Import] Fetching CSV from ${job.fileUrl}`);
    console.log("[Category Import] Parsing CSV content");
    const records = await fetchAndParseCSV<CategoryTranslationRecord>(job.fileUrl!);
    console.log(`[Category Import] Found ${records.length} records to import`);

    // Group records in batches for efficiency
    const batchSize = 20; // Process 20 categories at a time
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      try {
        console.log(
          `[Category Import] Processing batch ${Math.floor(i / batchSize) + 1}`
        );

        // Prepare categories for update
        const categories = batch
          .map((record) => prepareCategoryTranslationData(record, job.locale))
          .filter((category) => category.fields.length > 0); // Skip categories with no fields to update

        if (categories.length === 0) {
          console.log(
            "[Category Import] No fields to update in this batch, skipping"
          );
          continue;
        }

        // Update categories
        await graphqlClient.updateCategoryTranslations({
          channelId: job.channelId,
          locale: job.locale,
          categories,
        });

        console.log(
          `[Category Import] Successfully updated ${categories.length} categories`
        );
      } catch (error) {
        console.error(`[Category Import] Error updating batch:`, error);
        const errorWithResponse = error as Error & {
          response?: any;
          errors?: any;
        };
        // Log the error to the database
        await logTranslationError({
          jobId: job.id,
          entityId: 0, // Not applicable for categories
          lineNumber: i + 1,
          errorType: "api_error",
          errorMessage: errorWithResponse.message,
          rawData: JSON.stringify({
            batch,
            response: errorWithResponse.errors || errorWithResponse.response,
          }),
        });
        // Continue with next batch
      }

      // Add a small delay between batches for rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`[Category Import] Job ${job.id} completed successfully`);
  } catch (error) {
    console.error("[Category Import] Job failed:", error);
    throw error;
  }
}

// Process a category export job
async function processCategoryExportJob(
  job: TranslationJob,
  graphqlClient: any,
  restClient: BigCommerceRestClient
) {
  console.log(
    `[Category Export] Starting export job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    // Get channel details first
    console.log(
      `[Category Export] Fetching channel details for channel ${job.channelId}`
    );
    const channelResponse = await restClient.getChannel(job.channelId);
    const channelName =
      channelResponse.data?.name || `channel-${job.channelId}`;

    // Get channel locales to determine default locale
    console.log(
      `[Category Export] Fetching channel locales for channel ${job.channelId}`
    );
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(`[Category Export] Using default locale: ${defaultLocale}`);

    // Get category translations with pagination
    console.log(
      `[Category Export] Fetching category translations for channel ${job.channelId} and locale ${job.locale}`
    );
    const categoryEdges: any[] = [];
    let cursor: string | undefined;
    let pageNumber = 1;

    while (true) {
      const translationsPage = await graphqlClient.getCategoryTranslations({
        channelId: job.channelId,
        locale: job.locale,
        first: CONFIG.CATEGORIES_PER_PAGE,
        after: cursor,
      });

      const edges = translationsPage.edges || [];
      console.log(
        `[Category Export] Page ${pageNumber} returned ${edges.length} category translations`
      );
      categoryEdges.push(...edges);

      const pageInfo = translationsPage.pageInfo;
      if (pageInfo?.hasNextPage && pageInfo.endCursor) {
        cursor = pageInfo.endCursor;
        pageNumber += 1;
        console.log(
          `[Category Export] Waiting ${CONFIG.MIN_DELAY_BETWEEN_PAGES}ms before fetching next page`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.MIN_DELAY_BETWEEN_PAGES)
        );
      } else {
        break;
      }
    }

    console.log(
      `[Category Export] Found ${categoryEdges.length} category translations`
    );

    if (!categoryEdges.length) {
      throw new Error("No category translations found for export");
    }

    // Format translations for CSV
    const categoryRecords = categoryEdges.map((edge: any) => {
      const node = edge.node;
      return formatCategoryDataForCSV(
        node.resourceId,
        node.fields,
        defaultLocale,
        job.locale
      );
    });

    console.log(
      `[Category Export] Creating CSV for ${categoryRecords.length} categories`
    );

    // Generate CSV content
    const headers = generateCategoryCSVHeaders(defaultLocale, job.locale);
    const csvConfig: UnparseConfig = {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: true,
      newline: "\n",
      skipEmptyLines: true,
    };

    // Format records for CSV
    const csvData = categoryRecords.map((record: any) => {
      const row: Record<string, any> = {};
      headers.forEach((header) => {
        const value = record[header];
        row[header] = value === undefined || value === null ? "" : value;
      });
      return row;
    });

    const csvContent = Papa.unparse(
      {
        fields: headers,
        data: csvData,
      },
      csvConfig
    );

    // Upload to blob storage with unique filename including channel name
    console.log("[Category Export] Uploading CSV to blob storage");
    const uniqueFilename = generateUniqueExportFilename(
      job.id,
      job.storeHash,
      job.locale,
      channelName,
      "categories"
    );
    const { url } = await put(uniqueFilename, csvContent, {
      access: "public",
      contentType: "text/csv",
      addRandomSuffix: false,
    });

    console.log(`[Category Export] Upload complete. File URL: ${url}`);
    return url;
  } catch (error) {
    console.error("[Category Export] Job failed:", error);
    // Log the error to the database
    const errorWithResponse = error as Error & { response?: any };
    await logTranslationError({
      jobId: job.id,
      entityId: 0, // Not applicable for categories
      lineNumber: 0,
      errorType: "export_error",
      errorMessage: errorWithResponse.message,
      rawData: JSON.stringify({
        jobId: job.id,
        response: errorWithResponse.response,
      }),
    });
    throw error;
  }
}

// Process a brand import job
async function processBrandImportJob(
  job: TranslationJob,
  graphqlClient: any
) {
  console.log(
    `[Brand Import] Starting import job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    if (!job.fileUrl) {
      throw new Error("No file URL provided for import job");
    }

    // Get store token and create REST client
    const accessToken = await db.getStoreToken(job.storeHash);
    if (!accessToken) {
      throw new Error("Store token not found");
    }
    const restClient = createRestClient({
      accessToken,
      storeHash: job.storeHash,
    });

    // Fetch channel locales to get default locale
    console.log(
      `[Brand Import] Fetching channel locales for channel ${job.channelId}`
    );
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(`[Brand Import] Using default locale: ${defaultLocale}`);

    // Fetch and parse CSV file
    console.log(`[Brand Import] Fetching CSV from ${job.fileUrl}`);
    console.log("[Brand Import] Parsing CSV content");
    const records = await fetchAndParseCSV<BrandTranslationRecord>(job.fileUrl!);
    console.log(`[Brand Import] Found ${records.length} records to import`);

    // Group records in batches for efficiency
    const batchSize = 20; // Process 20 brands at a time
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      try {
        console.log(
          `[Brand Import] Processing batch ${Math.floor(i / batchSize) + 1}`
        );

        // Prepare brands for update
        const brands = batch
          .map((record) => prepareBrandTranslationData(record, job.locale))
          .filter((brand) => brand.fields.length > 0); // Skip brands with no fields to update

        if (brands.length === 0) {
          console.log(
            "[Brand Import] No fields to update in this batch, skipping"
          );
          continue;
        }

        // Update brands
        await graphqlClient.updateBrandTranslations({
          channelId: job.channelId,
          locale: job.locale,
          brands,
        });

        console.log(
          `[Brand Import] Successfully updated ${brands.length} brands`
        );
      } catch (error) {
        console.error(`[Brand Import] Error updating batch:`, error);
        const errorWithResponse = error as Error & {
          response?: any;
          errors?: any;
        };
        // Log the error to the database
        await logTranslationError({
          jobId: job.id,
          entityId: 0, // Not applicable for brands
          lineNumber: i + 1,
          errorType: "api_error",
          errorMessage: errorWithResponse.message,
          rawData: JSON.stringify({
            batch,
            response: errorWithResponse.errors || errorWithResponse.response,
          }),
        });
        // Continue with next batch
      }

      // Add a small delay between batches for rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`[Brand Import] Job ${job.id} completed successfully`);
  } catch (error) {
    console.error("[Brand Import] Job failed:", error);
    throw error;
  }
}

// Process a brand export job
async function processBrandExportJob(
  job: TranslationJob,
  graphqlClient: any,
  restClient: BigCommerceRestClient
) {
  console.log(
    `[Brand Export] Starting export job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    // Get channel details first
    console.log(
      `[Brand Export] Fetching channel details for channel ${job.channelId}`
    );
    const channelResponse = await restClient.getChannel(job.channelId);
    const channelName =
      channelResponse.data?.name || `channel-${job.channelId}`;

    // Get channel locales to determine default locale
    console.log(
      `[Brand Export] Fetching channel locales for channel ${job.channelId}`
    );
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(`[Brand Export] Using default locale: ${defaultLocale}`);

    // Get brand translations with pagination
    console.log(
      `[Brand Export] Fetching brand translations for channel ${job.channelId} and locale ${job.locale}`
    );
    const brandEdges: any[] = [];
    let cursor: string | undefined;
    let pageNumber = 1;

    while (true) {
      const translationsPage = await graphqlClient.getBrandTranslations({
        channelId: job.channelId,
        locale: job.locale,
        first: CONFIG.BRANDS_PER_PAGE,
        after: cursor,
      });

      const edges = translationsPage.edges || [];
      console.log(
        `[Brand Export] Page ${pageNumber} returned ${edges.length} brand translations`
      );
      brandEdges.push(...edges);

      const pageInfo = translationsPage.pageInfo;
      if (pageInfo?.hasNextPage && pageInfo.endCursor) {
        cursor = pageInfo.endCursor;
        pageNumber += 1;
        console.log(
          `[Brand Export] Waiting ${CONFIG.MIN_DELAY_BETWEEN_PAGES}ms before fetching next page`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.MIN_DELAY_BETWEEN_PAGES)
        );
      } else {
        break;
      }
    }

    console.log(
      `[Brand Export] Found ${brandEdges.length} brand translations`
    );

    if (!brandEdges.length) {
      throw new Error("No brand translations found for export");
    }

    // Format translations for CSV
    const brandRecords = brandEdges.map((edge: any) => {
      const node = edge.node;
      return formatBrandDataForCSV(
        node.resourceId,
        node.fields,
        defaultLocale,
        job.locale
      );
    });

    console.log(
      `[Brand Export] Creating CSV for ${brandRecords.length} brands`
    );

    // Generate CSV content
    const headers = generateBrandCSVHeaders(defaultLocale, job.locale);
    const csvConfig: UnparseConfig = {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: true,
      newline: "\n",
      skipEmptyLines: true,
    };

    // Format records for CSV
    const csvData = brandRecords.map((record: any) => {
      const row: Record<string, any> = {};
      headers.forEach((header) => {
        const value = record[header];
        row[header] = value === undefined || value === null ? "" : value;
      });
      return row;
    });

    const csvContent = Papa.unparse(
      {
        fields: headers,
        data: csvData,
      },
      csvConfig
    );

    // Upload to blob storage with unique filename including channel name
    console.log("[Brand Export] Uploading CSV to blob storage");
    const uniqueFilename = generateUniqueExportFilename(
      job.id,
      job.storeHash,
      job.locale,
      channelName,
      "brands"
    );
    const { url } = await put(uniqueFilename, csvContent, {
      access: "public",
      contentType: "text/csv",
      addRandomSuffix: false,
    });

    console.log(`[Brand Export] Upload complete. File URL: ${url}`);
    return url;
  } catch (error) {
    console.error("[Brand Export] Job failed:", error);
    // Log the error to the database
    const errorWithResponse = error as Error & { response?: any };
    await logTranslationError({
      jobId: job.id,
      entityId: 0, // Not applicable for brands
      lineNumber: 0,
      errorType: "export_error",
      errorMessage: errorWithResponse.message,
      rawData: JSON.stringify({
        jobId: job.id,
        response: errorWithResponse.response,
      }),
    });
    throw error;
  }
}

// Process an email templates import job
async function processEmailTemplatesImportJob(
  job: TranslationJob,
  restClient: BigCommerceRestClient
) {
  console.log(
    `[Email Templates Import] Starting import job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    if (!job.fileUrl) {
      throw new Error("No file URL provided for import job");
    }

    // Fetch channel locales to get default locale
    console.log(
      `[Email Templates Import] Fetching channel locales for channel ${job.channelId}`
    );
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(`[Email Templates Import] Using default locale: ${defaultLocale}`);

    // Fetch and parse CSV file
    console.log(`[Email Templates Import] Fetching CSV from ${job.fileUrl}`);
    console.log("[Email Templates Import] Parsing CSV content");
    const records = await fetchAndParseCSV<EmailTemplateTranslationRecord>(job.fileUrl!);
    console.log(`[Email Templates Import] Found ${records.length} records to import`);

    // Process each template
    for (const record of records) {
      try {
        const templateName = record.templateName;
        if (!templateName) {
          console.warn("[Email Templates Import] Skipping record without templateName");
          continue;
        }

        console.log(`[Email Templates Import] Processing template: ${templateName}`);

        // Get current template to preserve existing data
        // Strategy: Always get global template first, then check for channel override
        let currentTemplate;
        
        // Step 1: Get global template (always exists)
        try {
          const globalTemplateResponse = await restClient.getEmailTemplate(
            templateName,
            undefined
          );
          currentTemplate = globalTemplateResponse.data;
        } catch (globalError: any) {
          console.error(`[Email Templates Import] Error fetching global template:`, globalError);
          throw new Error(`Template ${templateName} not found: ${globalError.message}`);
        }

        // Step 2: If channelId is provided, try to get channel override and merge it
        if (job.channelId) {
          try {
            const channelTemplateResponse = await restClient.getEmailTemplate(
              templateName,
              job.channelId
            );
            const channelTemplate = channelTemplateResponse.data;
            
            // Merge channel override with global template
            currentTemplate = {
              ...currentTemplate,
              subject: channelTemplate.subject || currentTemplate.subject,
              body: channelTemplate.body || currentTemplate.body,
              // Merge translations: channel override translations take precedence
              translations: [
                ...(currentTemplate.translations || []).filter(
                  (t: any) => 
                    !channelTemplate.translations?.some((ct: any) => ct.locale === t.locale)
                ),
                ...(channelTemplate.translations || []),
              ],
            };
          } catch (channelError: any) {
            // Channel override doesn't exist - this is OK, we'll use global template
            if (channelError.status === 404 || channelError.message?.includes('404')) {
              console.log(`[Email Templates Import] No channel override found, using global template`);
            } else {
              console.warn(`[Email Templates Import] Error fetching channel override:`, channelError.message);
            }
          }
        }

        // Normalize locale to 2-letter format
        let normalizedLocale = String(job.locale || '').trim().toLowerCase();
        if (normalizedLocale.includes('-')) {
          normalizedLocale = normalizedLocale.split('-')[0];
        }
        
        if (normalizedLocale.length !== 2 || !/^[a-z]{2}$/.test(normalizedLocale)) {
          console.warn(`[Email Templates Import] Invalid locale format: ${job.locale}, skipping`);
          continue;
        }

        // Extract keys from CSV record
        // CSV format: key_reset_password_en, key_reset_password_it, etc.
        const keys: Record<string, string> = {};
        Object.keys(record).forEach(key => {
          if (key.startsWith('key_') && key.endsWith(`_${normalizedLocale}`)) {
            // Extract key name: key_reset_password_en -> reset_password
            const keyName = key.replace(/^key_/, '').replace(`_${normalizedLocale}`, '');
            const value = record[key];
            if (value && typeof value === 'string' && value.trim().length > 0) {
              keys[keyName] = String(value).trim();
            }
          }
        });

        if (Object.keys(keys).length === 0) {
          console.warn(`[Email Templates Import] No keys found for locale ${normalizedLocale} in record, skipping`);
          continue;
        }

        // Get existing translations (array format)
        const existingTranslations: any[] = Array.isArray(currentTemplate.translations) 
          ? [...currentTemplate.translations]
          : [];

        // Find existing translation for this locale
        const existingTranslationIndex = existingTranslations.findIndex(
          (t: any) => {
            let tLocale = String(t.locale || '').trim().toLowerCase();
            if (tLocale.includes('-')) {
              tLocale = tLocale.split('-')[0];
            }
            return tLocale === normalizedLocale;
          }
        );

        // Create or update translation with keys
        const translation = {
          locale: normalizedLocale,
          keys: keys,
        };

        if (existingTranslationIndex >= 0) {
          // Update existing translation - merge keys
          existingTranslations[existingTranslationIndex] = {
            ...existingTranslations[existingTranslationIndex],
            keys: {
              ...existingTranslations[existingTranslationIndex].keys,
              ...keys,
            },
          };
        } else {
          // Add new translation
          existingTranslations.push(translation);
        }

        // Update template - keep original subject/body, update translations
        await restClient.updateEmailTemplate(
          currentTemplate.type_id,
          {
            type_id: currentTemplate.type_id,
            subject: currentTemplate.subject || '',
            body: currentTemplate.body || '',
            translations: existingTranslations,
          },
          undefined // Translations are always global
        );

        console.log(`[Email Templates Import] Successfully updated template: ${templateName}`);
      } catch (error) {
        console.error(`[Email Templates Import] Error updating template:`, error);
        const errorWithResponse = error as Error & {
          response?: any;
        };
        // Log the error to the database
        await logTranslationError({
          jobId: job.id,
          entityId: 0,
          lineNumber: records.indexOf(record) + 1,
          errorType: "api_error",
          errorMessage: errorWithResponse.message,
          rawData: JSON.stringify({
            record,
            response: errorWithResponse.response,
          }),
        });
        // Continue with next template
      }

      // Add a small delay between templates for rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(`[Email Templates Import] Job ${job.id} completed successfully`);
  } catch (error) {
    console.error("[Email Templates Import] Job failed:", error);
    throw error;
  }
}

// Process an email templates export job
async function processEmailTemplatesExportJob(
  job: TranslationJob,
  restClient: BigCommerceRestClient
) {
  console.log(
    `[Email Templates Export] Starting export job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    // Get channel details first
    console.log(
      `[Email Templates Export] Fetching channel details for channel ${job.channelId}`
    );
    const channelResponse = await restClient.getChannel(job.channelId);
    const channelName =
      channelResponse.data?.name || `channel-${job.channelId}`;

    // Get channel locales to determine default locale
    console.log(
      `[Email Templates Export] Fetching channel locales for channel ${job.channelId}`
    );
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(`[Email Templates Export] Using default locale: ${defaultLocale}`);

    // Get all email templates
    console.log(
      `[Email Templates Export] Fetching email templates for channel ${job.channelId}`
    );
    const templatesResponse = await restClient.getEmailTemplates(job.channelId);
    const templates = templatesResponse.data || [];

    console.log(
      `[Email Templates Export] Found ${templates.length} email templates`
    );

    if (!templates.length) {
      throw new Error("No email templates found for export");
    }

    // Normalize locale for comparison
    let normalizedTargetLocale = String(job.locale || '').trim().toLowerCase();
    if (normalizedTargetLocale.includes('-')) {
      normalizedTargetLocale = normalizedTargetLocale.split('-')[0];
    }

    // Format translations for CSV
    const templateRecords = templates.map((template: any) => {
      // Find translation for the target locale
      const translation = template.translations?.find(
        (t: any) => {
          let tLocale = String(t.locale || '').trim().toLowerCase();
          if (tLocale.includes('-')) {
            tLocale = tLocale.split('-')[0];
          }
          return tLocale === normalizedTargetLocale;
        }
      );

      return formatEmailTemplateDataForCSV(
        template.name,
        template.type_id,
        template.subject,
        template.body,
        translation,
        defaultLocale,
        normalizedTargetLocale
      );
    });

    console.log(
      `[Email Templates Export] Creating CSV for ${templateRecords.length} templates`
    );

    // Generate CSV headers - include all keys found across templates
    const allKeys = new Set<string>();
    templates.forEach((template: any) => {
      const keys = extractTranslationKeys(template.body || '');
      keys.forEach(key => allKeys.add(key));
    });

    const headers = generateEmailTemplateCSVHeaders(
      defaultLocale, 
      normalizedTargetLocale,
      Array.from(allKeys)
    );
    const csvConfig: UnparseConfig = {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: true,
      newline: "\n",
      skipEmptyLines: true,
    };

    // Format records for CSV
    const csvData = templateRecords.map((record: any) => {
      const row: Record<string, any> = {};
      headers.forEach((header) => {
        const value = record[header];
        row[header] = value === undefined || value === null ? "" : value;
      });
      return row;
    });

    const csvContent = Papa.unparse(
      {
        fields: headers,
        data: csvData,
      },
      csvConfig
    );

    // Upload to blob storage with unique filename including channel name
    console.log("[Email Templates Export] Uploading CSV to blob storage");
    const uniqueFilename = generateUniqueExportFilename(
      job.id,
      job.storeHash,
      job.locale,
      channelName,
      "email-templates"
    );
    const { url } = await put(uniqueFilename, csvContent, {
      access: "public",
      contentType: "text/csv",
      addRandomSuffix: false,
    });

    console.log(`[Email Templates Export] Upload complete. File URL: ${url}`);
    return url;
  } catch (error) {
    console.error("[Email Templates Export] Job failed:", error);
    // Log the error to the database
    const errorWithResponse = error as Error & { response?: any };
    await logTranslationError({
      jobId: job.id,
      entityId: 0,
      lineNumber: 0,
      errorType: "export_error",
      errorMessage: errorWithResponse.message,
      rawData: JSON.stringify({
        jobId: job.id,
        response: errorWithResponse.response,
      }),
    });
    throw error;
  }
}

// Process a shared modifiers import job
async function processSharedModifiersImportJob(
  job: TranslationJob,
  graphqlClient: any
) {
  console.log(
    `[Shared Modifiers Import] Starting import job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    if (!job.fileUrl) {
      throw new Error("No file URL provided for import job");
    }

    // Fetch and parse CSV file
    console.log(`[Shared Modifiers Import] Fetching CSV from ${job.fileUrl}`);
    console.log("[Shared Modifiers Import] Parsing CSV content");
    const records = await fetchAndParseCSV<SharedModifierTranslationRecord>(job.fileUrl!);
    console.log(
      "[Shared Modifiers Import] CSV preview:",
      JSON.stringify(records.slice(0, 3), null, 2)
    );
    console.log(
      `[Shared Modifiers Import] Found ${records.length} records to import`
    );
    console.log(
      "[Shared Modifiers Import] First 3 records:",
      JSON.stringify(records.slice(0, 3), null, 2)
    );

    // Validate all records first
    const allErrors: string[] = [];
    records.forEach((record, index) => {
      const errors = validateCSVRecord(record, index + 2, job.locale);
      allErrors.push(...errors);
    });

    if (allErrors.length > 0) {
      throw new Error(`CSV validation failed:\n${allErrors.join("\n")}`);
    }

    // Group records by modifierId (convert to number for proper grouping)
    const modifierGroups = new Map<number, SharedModifierTranslationRecord[]>();
    records.forEach((record) => {
      const numericModifierId = typeof record.modifierId === 'string' 
        ? parseInt(record.modifierId, 10) 
        : record.modifierId;
      
      if (!modifierGroups.has(numericModifierId)) {
        modifierGroups.set(numericModifierId, []);
      }
      modifierGroups.get(numericModifierId)!.push(record);
    });

    console.log(
      `[Shared Modifiers Import] Grouped into ${modifierGroups.size} modifiers`
    );

    // Fetch modifier types for all modifiers in the CSV
    console.log("[Shared Modifiers Import] Fetching modifier types from API");
    const modifierIdsNeeded = Array.from(modifierGroups.keys());

    console.log(
      "[Shared Modifiers Import] Need types for modifier IDs:",
      JSON.stringify(modifierIdsNeeded)
    );

    const modifierTypesMap = new Map<number, string>();

    // Fetch all modifiers (we'll filter to only the ones we need)
    // Note: Not using 'ids' filter because it may not work as expected
    const typesResult = await graphqlClient.getSharedProductModifiers({
      channelId: job.channelId,
      locale: job.locale,
      first: 50,
    });

    console.log(
      "[Shared Modifiers Import] Query returned:",
      typesResult.edges?.length || 0,
      "modifiers"
    );

    if (typesResult.edges) {
      typesResult.edges.forEach((edge: any) => {
        const numericId = parseInt(edge.node.id.split("/").pop() || "0", 10);

        // Only map the ones we need
        if (modifierIdsNeeded.includes(numericId)) {
          console.log(
            `[Shared Modifiers Import] Found needed modifier: ${edge.node.id} -> ${numericId} -> ${edge.node.__typename}`
          );
          modifierTypesMap.set(numericId, edge.node.__typename);
        }
      });
    }

    console.log(
      `[Shared Modifiers Import] Found types for ${modifierTypesMap.size} of ${modifierIdsNeeded.length} modifiers`
    );
    console.log(
      "[Shared Modifiers Import] Types map:",
      JSON.stringify(Array.from(modifierTypesMap.entries()))
    );

    // Process modifiers in batches
    const modifierBatches: any[] = [];
    const batchSize = 10;

    modifierGroups.forEach((groupRecords, modifierId) => {
      const modifierType = modifierTypesMap.get(modifierId);
      if (!modifierType) {
        console.warn(
          `[Shared Modifiers Import] Skipping modifier ${modifierId}: type not found`
        );
        return;
      }

      const modifierData = prepareSharedModifierTranslationData(
        groupRecords,
        job.locale,
        modifierType,
        modifierId
      );

      if (modifierData) {
        modifierBatches.push(modifierData);
      }
    });

    console.log(
      `[Shared Modifiers Import] Prepared ${modifierBatches.length} modifiers for update`
    );

    // Update in batches
    for (let i = 0; i < modifierBatches.length; i += batchSize) {
      const batch = modifierBatches.slice(i, i + batchSize);

      try {
        console.log(
          `[Shared Modifiers Import] Processing batch ${
            Math.floor(i / batchSize) + 1
          } of ${Math.ceil(modifierBatches.length / batchSize)}`
        );

        // DEBUG: Log the mutation payload
        const mutationInput = {
          channelId: job.channelId,
          locale: job.locale,
          modifiers: batch,
        };
        console.log(
          "[Shared Modifiers Import] Mutation payload:",
          JSON.stringify(mutationInput, null, 2)
        );

        console.log(
          "[Shared Modifiers Import] Calling setSharedProductModifiersInformation..."
        );

        const result = await graphqlClient.setSharedProductModifiersInformation(
          mutationInput
        );

        // DEBUG: Log the mutation result
        console.log(
          "[Shared Modifiers Import] Mutation result:",
          JSON.stringify(result, null, 2)
        );

        console.log(
          `[Shared Modifiers Import] Successfully updated ${batch.length} modifiers`
        );
      } catch (error) {
        console.error(`[Shared Modifiers Import] Error updating batch:`, error);
        const errorWithResponse = error as Error & {
          response?: any;
          errors?: any;
        };
        // Log the error to the database
        await logTranslationError({
          jobId: job.id,
          entityId: 0,
          lineNumber: i + 1,
          errorType: "api_error",
          errorMessage: errorWithResponse.message,
          rawData: JSON.stringify({
            batch,
            response: errorWithResponse.errors || errorWithResponse.response,
          }),
        });
        // Continue with next batch
      }

      // Add a small delay between batches for rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(
      `[Shared Modifiers Import] Job ${job.id} completed successfully`
    );
  } catch (error) {
    console.error("[Shared Modifiers Import] Job failed:", error);
    throw error;
  }
}

// Process a shared modifiers export job
async function processSharedModifiersExportJob(
  job: TranslationJob,
  graphqlClient: any,
  restClient: BigCommerceRestClient
) {
  console.log(
    `[Shared Modifiers Export] Starting export job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    // Get channel details first
    console.log(
      `[Shared Modifiers Export] Fetching channel details for channel ${job.channelId}`
    );
    const channelResponse = await restClient.getChannel(job.channelId);
    const channelName =
      channelResponse.data?.name || `channel-${job.channelId}`;

    // Get channel locales to determine default locale
    console.log(
      `[Shared Modifiers Export] Fetching channel locales for channel ${job.channelId}`
    );
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(
      `[Shared Modifiers Export] Using default locale: ${defaultLocale}`
    );

    // Get shared modifiers with pagination
    console.log(
      `[Shared Modifiers Export] Fetching shared modifiers for channel ${job.channelId} and locale ${job.locale}`
    );
    const modifierEdges: any[] = [];
    let cursor: string | undefined;
    let pageNumber = 1;

    while (true) {
      const modifiersPage = await graphqlClient.getSharedProductModifiers({
        channelId: job.channelId,
        locale: job.locale,
        first: CONFIG.SHARED_MODIFIERS_PER_PAGE,
        after: cursor,
      });

      const edges = modifiersPage.edges || [];
      console.log(
        `[Shared Modifiers Export] Page ${pageNumber} returned ${edges.length} modifiers`
      );
      modifierEdges.push(...edges);

      const pageInfo = modifiersPage.pageInfo;
      if (pageInfo?.hasNextPage && pageInfo.endCursor) {
        cursor = pageInfo.endCursor;
        pageNumber += 1;
        console.log(
          `[Shared Modifiers Export] Waiting ${CONFIG.MIN_DELAY_BETWEEN_PAGES}ms before fetching next page`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.MIN_DELAY_BETWEEN_PAGES)
        );
      } else {
        break;
      }
    }

    console.log(
      `[Shared Modifiers Export] Found ${modifierEdges.length} shared modifiers`
    );

    if (!modifierEdges.length) {
      throw new Error("No shared modifiers found for export");
    }

    // Format modifiers for CSV (each modifier can produce multiple rows)
    const allRecords: any[] = [];
    modifierEdges.forEach((edge: any) => {
      const records = formatSharedModifierForCSV(
        edge.node,
        defaultLocale,
        job.locale
      );
      allRecords.push(...records);
    });

    console.log(
      `[Shared Modifiers Export] Creating CSV with ${allRecords.length} rows`
    );

    // Generate CSV content
    const headers = generateSharedModifierCSVHeaders(defaultLocale, job.locale);
    const csvConfig: UnparseConfig = {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: true,
      newline: "\n",
      skipEmptyLines: true,
    };

    // Format records for CSV
    const csvData = allRecords.map((record: any) => {
      const row: Record<string, any> = {};
      headers.forEach((header) => {
        const value = record[header];
        row[header] = value === undefined || value === null ? "" : value;
      });
      return row;
    });

    const csvContent = Papa.unparse(
      {
        fields: headers,
        data: csvData,
      },
      csvConfig
    );

    // Upload to blob storage with unique filename including channel name
    console.log("[Shared Modifiers Export] Uploading CSV to blob storage");
    const uniqueFilename = generateUniqueExportFilename(
      job.id,
      job.storeHash,
      job.locale,
      channelName,
      "shared-modifiers"
    );
    const { url } = await put(uniqueFilename, csvContent, {
      access: "public",
      contentType: "text/csv",
      addRandomSuffix: false,
    });

    console.log(`[Shared Modifiers Export] Upload complete. File URL: ${url}`);
    return url;
  } catch (error) {
    console.error(
      "[Shared Modifiers Export] Job failed:",
      JSON.stringify(error, null, 2)
    );
    // Log the error to the database
    const errorWithResponse = error as Error & { response?: any };
    await logTranslationError({
      jobId: job.id,
      entityId: 0,
      lineNumber: 0,
      errorType: "export_error",
      errorMessage: errorWithResponse.message,
      rawData: JSON.stringify({
        jobId: job.id,
        response: errorWithResponse.response,
      }),
    });
    throw error;
  }
}

// Process a shared options import job
async function processSharedOptionsImportJob(
  job: TranslationJob,
  graphqlClient: any
) {
  console.log(
    `[Shared Options Import] Starting import job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    if (!job.fileUrl) {
      throw new Error("No file URL provided for import job");
    }

    // Fetch and parse CSV file
    console.log(`[Shared Options Import] Fetching CSV from ${job.fileUrl}`);
    console.log("[Shared Options Import] Parsing CSV content");
    const records = await fetchAndParseCSV<SharedOptionTranslationRecord>(job.fileUrl!);
    console.log(
      "[Shared Options Import] CSV preview:",
      JSON.stringify(records.slice(0, 3), null, 2)
    );
    console.log(
      `[Shared Options Import] Found ${records.length} records to import`
    );
    console.log(
      "[Shared Options Import] First 3 records:",
      JSON.stringify(records.slice(0, 3), null, 2)
    );

    // Validate all records first
    const allErrors: string[] = [];
    records.forEach((record, index) => {
      const errors = validateOptionCSVRecord(record, index + 2, job.locale);
      allErrors.push(...errors);
    });

    if (allErrors.length > 0) {
      throw new Error(`CSV validation failed:\n${allErrors.join("\n")}`);
    }

    // Group records by optionId (store as string key for easier matching)
    const optionGroups = new Map<string, SharedOptionTranslationRecord[]>();
    records.forEach((record) => {
      const numericOptionId =
        typeof record.optionId === "string"
          ? parseInt(record.optionId, 10)
          : record.optionId;

      if (Number.isNaN(numericOptionId) || numericOptionId == null) {
        console.warn(
          "[Shared Options Import] Skipping record with invalid optionId:",
          record.optionId
        );
        return;
      }

      const optionKey = numericOptionId.toString();

      if (!optionGroups.has(optionKey)) {
        optionGroups.set(optionKey, []);
      }
      optionGroups.get(optionKey)!.push(record);
    });

    console.log(
      `[Shared Options Import] Grouped into ${optionGroups.size} options`
    );

    // Fetch option types for all options in the CSV
    console.log("[Shared Options Import] Fetching option types from API");
    const optionIdsNeeded = Array.from(optionGroups.keys());

    console.log(
      "[Shared Options Import] Need types for option IDs:",
      JSON.stringify(optionIdsNeeded)
    );

    const optionTypesMap = new Map<string, string>();

    const optionGraphqlIds = optionIdsNeeded.map(
      (id) => `bc/store/sharedProductOption/${id}`
    );

    // Fetch only the options we need
    const typesResult = await graphqlClient.getSharedProductOptions({
      channelId: job.channelId,
      locale: job.locale,
      first: optionGraphqlIds.length || 50,
      ids: optionGraphqlIds,
    });

    console.log(
      "[Shared Options Import] Query returned:",
      typesResult.edges?.length || 0,
      "options"
    );

    if (typesResult.edges) {
      typesResult.edges.forEach((edge: any) => {
        const numericIdString = edge.node.id.split("/").pop() || "";
        if (optionIdsNeeded.includes(numericIdString)) {
          console.log(
            `[Shared Options Import] Found needed option: ${edge.node.id} -> ${numericIdString} -> ${edge.node.__typename}`
          );
          optionTypesMap.set(numericIdString, edge.node.__typename);
        }
      });
    }

    console.log(
      `[Shared Options Import] Found types for ${optionTypesMap.size} of ${optionIdsNeeded.length} options`
    );
    console.log(
      "[Shared Options Import] Types map:",
      JSON.stringify(Array.from(optionTypesMap.entries()))
    );

    // Process options in batches
    const optionBatches: any[] = [];
    const batchSize = 10;

    optionGroups.forEach((groupRecords, optionId) => {
      const optionType = optionTypesMap.get(optionId);
      if (!optionType) {
        console.warn(
          `[Shared Options Import] Skipping option ${optionId}: type not found`
        );
        return;
      }

      const optionData = prepareSharedOptionTranslationData(
        groupRecords,
        job.locale,
        optionType,
        Number(optionId)
      );

      if (optionData) {
        optionBatches.push(optionData);
      }
    });

    console.log(
      `[Shared Options Import] Prepared ${optionBatches.length} options for update`
    );

    // Update in batches
    for (let i = 0; i < optionBatches.length; i += batchSize) {
      const batch = optionBatches.slice(i, i + batchSize);

      try {
        console.log(
          `[Shared Options Import] Processing batch ${
            Math.floor(i / batchSize) + 1
          } of ${Math.ceil(optionBatches.length / batchSize)}`
        );

        // DEBUG: Log the mutation payload
        const mutationInput = {
          channelId: job.channelId,
          locale: job.locale,
          options: batch,
        };
        console.log(
          "[Shared Options Import] Mutation payload:",
          JSON.stringify(mutationInput, null, 2)
        );

        console.log(
          "[Shared Options Import] Calling setSharedProductOptionsInformation..."
        );

        const result = await graphqlClient.setSharedProductOptionsInformation(
          mutationInput
        );

        // DEBUG: Log the mutation result
        console.log(
          "[Shared Options Import] Mutation result:",
          JSON.stringify(result, null, 2)
        );

        console.log(
          `[Shared Options Import] Successfully updated ${batch.length} options`
        );
      } catch (error) {
        console.error(`[Shared Options Import] Error updating batch:`, error);
        const errorWithResponse = error as Error & {
          response?: any;
          errors?: any;
        };
        // Log the error to the database
        await logTranslationError({
          jobId: job.id,
          entityId: 0,
          lineNumber: i + 1,
          errorType: "api_error",
          errorMessage: errorWithResponse.message,
          rawData: JSON.stringify({
            batch,
            response: errorWithResponse.errors || errorWithResponse.response,
          }),
        });
        // Continue with next batch
      }

      // Add a small delay between batches for rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(
      `[Shared Options Import] Job ${job.id} completed successfully`
    );
  } catch (error) {
    console.error("[Shared Options Import] Job failed:", error);
    throw error;
  }
}

// Process a shared options export job
async function processSharedOptionsExportJob(
  job: TranslationJob,
  graphqlClient: any,
  restClient: BigCommerceRestClient
) {
  console.log(
    `[Shared Options Export] Starting export job ${job.id} for channel ${job.channelId} and locale ${job.locale}`
  );

  try {
    // Get channel details first
    console.log(
      `[Shared Options Export] Fetching channel details for channel ${job.channelId}`
    );
    const channelResponse = await restClient.getChannel(job.channelId);
    const channelName =
      channelResponse.data?.name || `channel-${job.channelId}`;

    // Get channel locales to determine default locale
    console.log(
      `[Shared Options Export] Fetching channel locales for channel ${job.channelId}`
    );
    const { data: localesData } = await restClient.getChannelLocales(
      job.channelId
    );
    const defaultLocale =
      localesData.find((locale) => locale.is_default)?.code ||
      fallbackLocale.code;
    console.log(
      `[Shared Options Export] Using default locale: ${defaultLocale}`
    );

    // Get shared options with pagination
    console.log(
      `[Shared Options Export] Fetching shared options for channel ${job.channelId} and locale ${job.locale}`
    );
    const optionEdges: any[] = [];
    let cursor: string | undefined;
    let pageNumber = 1;

    while (true) {
      const optionsPage = await graphqlClient.getSharedProductOptions({
        channelId: job.channelId,
        locale: job.locale,
        first: CONFIG.SHARED_OPTIONS_PER_PAGE,
        after: cursor,
      });

      const edges = optionsPage.edges || [];
      console.log(
        `[Shared Options Export] Page ${pageNumber} returned ${edges.length} options`
      );
      optionEdges.push(...edges);

      const pageInfo = optionsPage.pageInfo;
      if (pageInfo?.hasNextPage && pageInfo.endCursor) {
        cursor = pageInfo.endCursor;
        pageNumber += 1;
        console.log(
          `[Shared Options Export] Waiting ${CONFIG.MIN_DELAY_BETWEEN_PAGES}ms before fetching next page`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.MIN_DELAY_BETWEEN_PAGES)
        );
      } else {
        break;
      }
    }

    console.log(
      `[Shared Options Export] Found ${optionEdges.length} shared options`
    );

    if (!optionEdges.length) {
      throw new Error("No shared options found for export");
    }

    // Format options for CSV (each option can produce multiple rows)
    const allRecords: any[] = [];
    optionEdges.forEach((edge: any) => {
      const records = formatSharedOptionForCSV(
        edge.node,
        defaultLocale,
        job.locale
      );
      allRecords.push(...records);
    });

    console.log(
      `[Shared Options Export] Creating CSV with ${allRecords.length} rows`
    );

    // Generate CSV content
    const headers = generateSharedOptionCSVHeaders(defaultLocale, job.locale);
    const csvConfig: UnparseConfig = {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: true,
      newline: "\n",
      skipEmptyLines: true,
    };

    // Format records for CSV
    const csvData = allRecords.map((record: any) => {
      const row: Record<string, any> = {};
      headers.forEach((header) => {
        const value = record[header];
        row[header] = value === undefined || value === null ? "" : value;
      });
      return row;
    });

    const csvContent = Papa.unparse(
      {
        fields: headers,
        data: csvData,
      },
      csvConfig
    );

    // Upload to blob storage with unique filename including channel name
    console.log("[Shared Options Export] Uploading CSV to blob storage");
    const uniqueFilename = generateUniqueExportFilename(
      job.id,
      job.storeHash,
      job.locale,
      channelName,
      "shared-options"
    );
    const { url } = await put(uniqueFilename, csvContent, {
      access: "public",
      contentType: "text/csv",
      addRandomSuffix: false,
    });

    console.log(`[Shared Options Export] Upload complete. File URL: ${url}`);
    return url;
  } catch (error) {
    console.error(
      "[Shared Options Export] Job failed:",
      JSON.stringify(error, null, 2)
    );
    // Log the error to the database
    const errorWithResponse = error as Error & { response?: any };
    await logTranslationError({
      jobId: job.id,
      entityId: 0,
      lineNumber: 0,
      errorType: "export_error",
      errorMessage: errorWithResponse.message,
      rawData: JSON.stringify({
        jobId: job.id,
        response: errorWithResponse.response,
      }),
    });
    throw error;
  }
}

// ============================================================================
// JOB ROUTING HELPERS
// ============================================================================

// Helper function to process import job by resource type
async function processImportJobByType(
  job: TranslationJob,
  graphqlClient: GraphQLClient
): Promise<void> {
  if (job.resourceType === "categories") {
    await processCategoryImportJob(job, graphqlClient);
    await db.updateTranslationJob(job.id, { status: "completed" });
  } else if (job.resourceType === "brands") {
    await processBrandImportJob(job, graphqlClient);
    await db.updateTranslationJob(job.id, { status: "completed" });
  } else if (job.resourceType === "email-templates") {
    const accessToken = await db.getStoreToken(job.storeHash);
    if (!accessToken) {
      throw new Error("Store token not found");
    }
    const restClient = createRestClient({
      accessToken,
      storeHash: job.storeHash,
    });
    await processEmailTemplatesImportJob(job, restClient);
    await db.updateTranslationJob(job.id, { status: "completed" });
  } else if (job.resourceType === "shared-modifiers") {
    await processSharedModifiersImportJob(job, graphqlClient);
    await db.updateTranslationJob(job.id, { status: "completed" });
  } else if (job.resourceType === "shared-options") {
    await processSharedOptionsImportJob(job, graphqlClient);
    await db.updateTranslationJob(job.id, { status: "completed" });
  } else {
    // Products import with chunking support
    await processImportJob(job, graphqlClient);
    // Check if import job is complete (processImportJob updates metadata)
    const updatedJob = await db.getTranslationJobs(job.storeHash);
    const currentJob = updatedJob.find((j) => j.id === job.id);
    if (currentJob) {
      const importMetadata = getImportChunkMetadata(currentJob);
      if (importMetadata?.isComplete) {
        await db.updateTranslationJob(job.id, { status: "completed" });
      }
      // If not complete, status is already set to "pending" by processImportJob
    }
  }
}

// Helper function to process export job by resource type
async function processExportJobByType(
  job: TranslationJob,
  graphqlClient: GraphQLClient,
  restClient: BigCommerceRestClient
): Promise<void> {
  let fileUrl: string | null = null;

  if (job.resourceType === "categories") {
    fileUrl = await processCategoryExportJob(job, graphqlClient, restClient);
    await db.updateTranslationJob(job.id, {
      status: "completed",
      fileUrl: fileUrl,
    });
  } else if (job.resourceType === "brands") {
    fileUrl = await processBrandExportJob(job, graphqlClient, restClient);
    await db.updateTranslationJob(job.id, {
      status: "completed",
      fileUrl: fileUrl,
    });
  } else if (job.resourceType === "email-templates") {
    fileUrl = await processEmailTemplatesExportJob(job, restClient);
    await db.updateTranslationJob(job.id, {
      status: "completed",
      fileUrl: fileUrl,
    });
  } else if (job.resourceType === "shared-modifiers") {
    fileUrl = await processSharedModifiersExportJob(
      job,
      graphqlClient,
      restClient
    );
    await db.updateTranslationJob(job.id, {
      status: "completed",
      fileUrl: fileUrl,
    });
  } else if (job.resourceType === "shared-options") {
    fileUrl = await processSharedOptionsExportJob(
      job,
      graphqlClient,
      restClient
    );
    await db.updateTranslationJob(job.id, {
      status: "completed",
      fileUrl: fileUrl,
    });
  } else {
    // Products export with chunking support
    fileUrl = await processExportJob(job, graphqlClient, restClient);
    // Only update to completed if fileUrl is not null (job is complete)
    if (fileUrl !== null) {
      await db.updateTranslationJob(job.id, {
        status: "completed",
        fileUrl: fileUrl,
      });
    }
    // If fileUrl is null, the job is not complete and status is already set to "pending" by processExportJob
  }
}

// ============================================================================
// API HANDLERS
// ============================================================================

// Remove POST handler and keep only GET handler
export async function GET(request: NextRequest) {
  try {
    // Updated verification
    const auth = await verifyAuthorization(request);

    // Get pending jobs (filtered by store if user auth)
    const pendingJobs =
      auth.type === "user"
        ? await db.getPendingTranslationJobsByStore(auth.storeHash)
        : await db.getPendingTranslationJobs();

    // Process each job - IMPORTANT: Each job processes ONLY ONE chunk per cron execution
    // This ensures we don't exceed Vercel timeout limits
    for (const job of pendingJobs) {
      try {
        // Get store token
        const accessToken = await db.getStoreToken(job.storeHash);
        if (!accessToken) {
          throw new Error("Store token not found");
        }

        // Create GraphQL client
        const graphqlClient = createGraphQLClient(accessToken, job.storeHash);
        // Create Rest client
        const restClient = createRestClient({
          accessToken,
          storeHash: job.storeHash,
        });

        // Update job status to processing
        await db.updateTranslationJob(job.id, { status: "processing" });

        // Process based on job type and resource type
        if (job.jobType === "import") {
          await processImportJobByType(job, graphqlClient);
        } else {
          await processExportJobByType(job, graphqlClient, restClient);
        }
      } catch (error: any) {
        // Update job status to failed
        await db.updateTranslationJob(job.id, {
          status: "failed",
          error: error.message,
        });
      }
    }

    return new Response("Jobs processed successfully", { status: 200 });
  } catch (error: any) {
    console.error("Error processing jobs:", error);
    return new Response(error.message || "Internal Server Error", {
      status: error.status || 500,
    });
  }
}
