# Shared Options Implementation - Summary

## Overview

This document describes the implementation of CSV import/export support for shared product options, following the same pattern established for shared modifiers.

## Implementation Details

This implementation adds the ability to export and import translations for shared product options via CSV files. Shared product options are global options that can be reused across multiple products.

## Files Created

### 1. GraphQL Queries
**File:** `lib/graphql-client/src/queries/shared-options.tada.ts`

- `GetSharedProductOptionsDocument` - Query to retrieve shared product options with locale overrides
- `SetSharedProductOptionsInformationDocument` - Mutation to update shared product option translations
- Helper functions:
  - `createGetSharedProductOptionsVariables()` - Builds query variables
  - `createSetSharedProductOptionsVariables()` - Builds mutation variables

**Supported Option Types:**
- DropdownSharedProductOption
- RadioButtonsSharedProductOption
- RectangleListSharedProductOption
- SwatchSharedProductOption

### 2. Utility Helpers
**File:** `lib/utils/shared-option-helpers.ts`

**Key Functions:**

- `formatSharedOptionForCSV()` - Converts API data to CSV records
  - Handles options with values (one row per value)
  - Handles display name translations
  
- `prepareSharedOptionTranslationData()` - Converts CSV data to API mutation format
  - Groups records by optionId
  - Formats data according to option type
  
- `generateSharedOptionCSVHeaders()` - Creates CSV column headers
  - `optionId`, `valueId`, `displayName_[locale]`, `valueLabel_[locale]`
  
- `generateCSVTemplate()` - Creates example CSV data for download
  
- `validateCSVRecord()` - Validates CSV rows before processing
  - Checks required fields
  - Validates data format

**Helper Functions:**
- `optionTypeHasValues()` - Checks if option type includes selectable values
- `extractNumericId()` - Extracts numeric ID from GraphQL ID format
- `getLocaleField()` - Retrieves locale-specific field from record

### 3. API Route for CSV Template
**File:** `app/api/shared-options/template/route.ts`

**Endpoint:** `GET /api/shared-options/template`

**Query Parameters:**
- `defaultLocale` (optional, default: "en")
- `targetLocale` (optional, default: "it")

**Response:**
- CSV file with example data
- Filename: `shared-options-template.csv`
- Content-Type: `text/csv`

### 4. GraphQL Client Integration
**File:** `lib/graphql-client/src/client.ts`

**New Methods:**

```typescript
async getSharedProductOptions(params: {
  channelId: number;
  locale: string;
  first?: number;
  after?: string | null;
  ids?: string[];
})

async setSharedProductOptionsInformation(params: {
  channelId: number;
  locale: string;
  options: Array<{
    optionId: string;
    type: string;
    data: any;
  }>;
})
```

### 5. Cron Job Integration
**File:** `app/api/translations/cron/route.ts`

**New Functions:**

- `processSharedOptionsImportJob()` - Handles CSV import for shared options
  - Parses CSV file
  - Validates records
  - Groups by optionId
  - Fetches option types from API
  - Prepares mutation data
  - Updates options in batches (10 per batch)
  
- `processSharedOptionsExportJob()` - Handles CSV export for shared options
  - Fetches all shared options with pagination
  - Formats data for CSV
  - Generates CSV file
  - Uploads to blob storage

**Configuration:**
- Added `SHARED_OPTIONS_PER_PAGE` config (default: 50)
- Environment variable: `TRANSLATION_SHARED_OPTIONS_PER_PAGE`

**Routing:**
- Import: Checks for `resourceType === "shared-options"`
- Export: Checks for `resourceType === "shared-options"`

### 6. UI Updates
**File:** `app/translations/jobs/page.tsx`

**Changes:**
- Updated `TranslationJob` type to include `"shared-options"` in resourceType
- Updated `selectedResourceType` state type
- Added "Shared Options" toggle option in Import modal
- Added "Shared Options" toggle option in Export modal

**Translation Files:**
- `messages/en-US.json` - Added "Shared Options" label
- `messages/it-IT.json` - Added "Opzioni Condivise" label

## CSV Format

### Structure

```csv
optionId,valueId,displayName_en,displayName_it,valueLabel_en,valueLabel_it
1,,,Size,Taglia,,
1,1,,,,Small,Piccolo
1,2,,,,Medium,Medio
1,3,,,,Large,Grande
2,,,Color,Colore,,
2,4,,,,Red,Rosso
2,5,,,,Blue,Blu
```

### Rules

1. **First row per option**: Contains optionId and displayName translations
2. **Subsequent rows**: One per value, containing valueId and valueLabel translations
3. **Empty cells**: Use empty strings for fields that don't apply to that row
4. **optionId**: Required on every row, numeric ID of the shared option
5. **valueId**: Required only for value rows, numeric ID of the option value

## Data Flow

### Export Flow

```
User clicks Export → Job created in DB
↓
Cron job picks up pending job
↓
processSharedOptionsExportJob()
  → Fetch channel details
  → Get default locale
  → Fetch all shared options (paginated)
  → Format each option for CSV (formatSharedOptionForCSV)
  → Generate CSV content
  → Upload to blob storage
↓
Job marked as completed with fileUrl
↓
User downloads CSV file
```

### Import Flow

```
User uploads CSV → Job created with file upload
↓
Cron job picks up pending job
↓
processSharedOptionsImportJob()
  → Fetch and parse CSV
  → Validate all records
  → Group records by optionId
  → Fetch option types from API
  → Prepare mutation data for each option
  → Update options in batches (10 per batch)
↓
Job marked as completed or failed
```

## API Integration

### GraphQL Query
```graphql
query GetSharedProductOptions(
  $first: Int
  $after: String
  $filters: SharedProductOptionsFiltersInput
  $localeContext: ProductOverridesLocaleContextInput!
) {
  store {
    sharedProductOptions(first: $first, after: $after, filters: $filters) {
      pageInfo { hasNextPage, endCursor }
      edges {
        node {
          id
          displayName
          __typename
          ... on DropdownSharedProductOption {
            values { id, label, isDefault }
            overridesForLocale(localeContext: $localeContext) {
              displayName
              values { id, label }
            }
          }
          # ... other option types
        }
      }
    }
  }
}
```

### GraphQL Mutation
```graphql
mutation SetSharedProductOptionsInformation(
  $input: SetSharedProductOptionsInformationInput!
) {
  sharedProductOptions {
    setSharedProductOptionsInformation(input: $input) {
      sharedProductOptions {
        id
        displayName
        __typename
      }
    }
  }
}
```

### Mutation Input Structure
```typescript
{
  input: {
    localeContext: {
      channelId: "bc/store/channel/1",
      locale: "it"
    },
    data: {
      options: [
        {
          optionId: "bc/store/sharedProductOption/1",
          data: {
            dropdown: {  // or radioButtons, rectangleList, swatch
              displayName: "Taglia",
              values: [
                { valueId: "bc/store/sharedProductOptionValue/1", label: "Piccolo" },
                { valueId: "bc/store/sharedProductOptionValue/2", label: "Medio" }
              ]
            }
          }
        }
      ]
    }
  }
}
```

## Error Handling

### Validation Errors
- Missing optionId
- Missing translations
- Invalid CSV format
- Logged to translation_errors table

### API Errors
- Option not found
- Invalid mutation data
- Rate limiting
- Logged with full request/response data

### Batch Processing
- Continues on error (doesn't stop entire job)
- Each failed batch logged separately
- Successful batches still committed

## Testing

### Manual Testing Checklist

1. **Export functionality**
   - [ ] Export generates valid CSV
   - [ ] All option types included
   - [ ] Values properly formatted
   - [ ] Display names in both locales
   - [ ] Empty fields handled correctly

2. **Import functionality**
   - [ ] CSV parsing works correctly
   - [ ] Validation catches errors
   - [ ] Options updated successfully
   - [ ] Values updated successfully
   - [ ] Display names updated correctly

3. **UI functionality**
   - [ ] "Shared Options" appears in dropdown
   - [ ] Jobs created with correct resourceType
   - [ ] CSV template download works
   - [ ] Import/export flow completes

4. **Error handling**
   - [ ] Invalid CSV rejected
   - [ ] Missing options handled gracefully
   - [ ] Partial updates handled correctly
   - [ ] Errors logged properly

## Comparison with Shared Modifiers

This implementation follows the exact same pattern as shared modifiers:

| Aspect | Shared Modifiers | Shared Options |
|--------|-----------------|----------------|
| Query file | shared-modifiers.tada.ts | shared-options.tada.ts |
| Helpers file | shared-modifier-helpers.ts | shared-option-helpers.ts |
| Template route | /api/shared-modifiers/template | /api/shared-options/template |
| Client methods | get/setSharedProductModifiers | get/setSharedProductOptions |
| Cron functions | processSharedModifiers* | processSharedOptions* |
| CSV structure | Same format | Same format |
| Resource type | "shared-modifiers" | "shared-options" |

## Configuration

### Environment Variables
```
TRANSLATION_SHARED_OPTIONS_PER_PAGE=50
```

### Batch Sizes
- Import batch size: 10 options per mutation
- Export page size: 50 options per query
- Delay between batches: 500ms

## Future Enhancements

1. **Validation improvements**
   - Check option exists before updating
   - Validate value IDs exist
   - Better error messages

2. **Performance optimization**
   - Parallel batch processing
   - Smarter pagination
   - Caching of option types

3. **Feature additions**
   - Bulk delete translations
   - Copy translations between channels
   - Translation memory integration

## Rollback Plan

If issues arise:

1. Remove "shared-options" from UI toggle options
2. Comment out shared-options routing in cron job
3. No database changes needed (jobs table already supports any resourceType)
4. No breaking changes to existing functionality

## Documentation Links

- BigCommerce GraphQL API: Shared Product Options
- CSV Best Practices: [Internal Wiki]
- Translation Job System: [Architecture Docs]

## Conclusion

This implementation provides complete CSV import/export support for shared product options, following established patterns and maintaining consistency with the existing shared modifiers implementation. All new code is well-documented, error-handled, and follows TypeScript best practices.

