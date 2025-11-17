import { graphql, ResultOf } from "../graphql";

// Get Shared Product Options Query
export const GetSharedProductOptionsDocument = graphql(`
  query GetSharedProductOptions(
    $first: Int
    $after: String
    $filters: SharedProductOptionsFiltersInput
    $localeContext: ProductOverridesLocaleContextInput!
  ) {
    store {
      sharedProductOptions(
        first: $first
        after: $after
        filters: $filters
      ) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        edges {
          cursor
          node {
            id
            displayName
            __typename
            
            # Dropdown specific
            ... on DropdownSharedProductOption {
              values {
                id
                label
                isDefault
              }
              overridesForLocale(localeContext: $localeContext) {
                displayName
                values {
                  id
                  label
                }
              }
            }
            
            # RadioButtons specific
            ... on RadioButtonsSharedProductOption {
              values {
                id
                label
                isDefault
              }
              overridesForLocale(localeContext: $localeContext) {
                displayName
                values {
                  id
                  label
                }
              }
            }
            
            # RectangleList specific
            ... on RectangleListSharedProductOption {
              values {
                id
                label
                isDefault
              }
              overridesForLocale(localeContext: $localeContext) {
                displayName
                values {
                  id
                  label
                }
              }
            }
            
            # Swatch specific
            ... on SwatchSharedProductOption {
              values {
                id
                label
                isDefault
              }
              overridesForLocale(localeContext: $localeContext) {
                displayName
                values {
                  id
                  label
                }
              }
            }
          }
        }
      }
    }
  }
`);

// Set Shared Product Options Information Mutation
export const SetSharedProductOptionsInformationDocument = graphql(`
  mutation SetSharedProductOptionsInformation($input: SetSharedProductOptionsInformationInput!) {
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
`);

// Helper function to create variables for getting shared options
export function createGetSharedProductOptionsVariables(params: {
  channelId: number;
  locale: string;
  first?: number;
  after?: string | null;
  ids?: string[];
}) {
  const variables: {
    first?: number;
    after?: string | null;
    filters?: { ids: string[] };
    localeContext: {
      channelId: string;
      locale: string;
    };
  } = {
    localeContext: {
      channelId: `bc/store/channel/${params.channelId}`,
      locale: params.locale
    }
  };

  if (typeof params.first === 'number') {
    variables.first = params.first;
  }

  if (params.after !== undefined && params.after !== null) {
    variables.after = params.after;
  }

  if (params.ids && params.ids.length > 0) {
    variables.filters = { ids: params.ids };
  }

  return variables;
}

// Helper function to create variables for setting shared options
export function createSetSharedProductOptionsVariables(params: {
  channelId: number;
  locale: string;
  options: Array<{
    optionId: string;
    type: string;
    data: any;
  }>;
}) {
  return {
    input: {
      localeContext: {
        channelId: `bc/store/channel/${params.channelId}`,
        locale: params.locale
      },
      data: {
        options: params.options.map(option => ({
          optionId: option.optionId,
          data: option.data
        }))
      }
    }
  };
}

