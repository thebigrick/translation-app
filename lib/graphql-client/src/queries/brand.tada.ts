import { graphql, ResultOf } from "../graphql";
import { formatChannelId } from "../utils";

// Get Brands Translations Query
export const GetBrandTranslationsDocument = graphql(`
  query GetBrandTranslations($channelId: ID!, $localeId: ID!, $first: Int, $after: String) {
    store {
      translations(
        filters: {
          resourceType: BRANDS,
          channelId: $channelId,
          localeId: $localeId
        },
        first: $first,
        after: $after
      ) {
        edges {
          node {
            resourceId
            fields {
              fieldName
              original
              translation
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`);

// Update Brand Translations Mutation
export const UpdateBrandTranslationsDocument = graphql(`
  mutation UpdateBrandTranslations($input: UpdateTranslationsInput!) {
    translation {
      updateTranslations(input: $input) {
        errors {
          ... on Error {
            message
          }
        }
      }
    }
  }
`);

// Delete Brand Translations Mutation
export const DeleteBrandTranslationsDocument = graphql(`
  mutation DeleteBrandTranslations($input: DeleteTranslationsInput!) {
    translation {
      deleteTranslations(input: $input) {
        errors {
          ... on Error {
            message
          }
        }
      }
    }
  }
`);

// Helper function to create variables for updating brand translations
export function createUpdateBrandTranslationsVariables(params: {
  channelId: number;
  locale: string;
  brands: Array<{
    brandId: number;
    fields: Array<{
      fieldName: string;
      value: string;
    }>
  }>
}) {
  return {
    input: {
      resourceType: "BRANDS",
      channelId: `bc/store/channel/${params.channelId}`,
      localeId: `bc/store/locale/${params.locale}`,
      entities: params.brands.map(brand => ({
        resourceId: `bc/store/brand/${brand.brandId}`,
        fields: brand.fields
      }))
    }
  };
}

// Helper function to create variables for deleting brand translations
export function createDeleteBrandTranslationsVariables(params: {
  channelId: number;
  locale: string;
  brands: Array<{
    brandId: number;
    fields: string[]
  }>
}) {
  return {
    input: {
      resourceType: "BRANDS",
      channelId: `bc/store/channel/${params.channelId}`,
      localeId: `bc/store/locale/${params.locale}`,
      resources: params.brands.map(brand => ({
        resourceId: `bc/store/brand/${brand.brandId}`,
        fields: brand.fields
      }))
    }
  };
}

// Helper function to create variables for getting brand translations
export function createGetBrandTranslationsVariables(params: {
  channelId: number;
  locale: string;
  first?: number;
  after?: string | null;
}) {
  const variables: {
    channelId: string;
    localeId: string;
    first?: number;
    after?: string | null;
  } = {
    channelId: `bc/store/channel/${params.channelId}`,
    localeId: `bc/store/locale/${params.locale}`
  };

  if (typeof params.first === 'number') {
    variables.first = params.first;
  }

  if (params.after !== undefined && params.after !== null) {
    variables.after = params.after;
  }

  return variables;
}

