import { graphql, ResultOf } from "../graphql";

// Get Shared Product Modifiers Query
export const GetSharedProductModifiersDocument = graphql(`
  query GetSharedProductModifiers(
    $first: Int
    $after: String
    $filters: SharedProductModifiersFiltersInput
    $localeContext: ProductOverridesLocaleContextInput!
  ) {
    store {
      sharedProductModifiers(
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
            isRequired
            __typename
            
            # Checkbox specific
            ... on CheckboxSharedProductModifier {
              fieldValue
              overridesForLocale(localeContext: $localeContext) {
                displayName
                fieldValue
              }
            }
            
            # TextField specific
            ... on TextFieldSharedProductModifier {
              defaultValue
              overridesForLocale(localeContext: $localeContext) {
                displayName
                defaultValue
              }
            }
            
            # MultilineTextField specific
            ... on MultilineTextFieldSharedProductModifier {
              defaultValue
              overridesForLocale(localeContext: $localeContext) {
                displayName
                defaultValue
              }
            }
            
            # NumberField specific
            ... on NumbersOnlyTextFieldSharedProductModifier {
              defaultValueFloat: defaultValue
              overridesForLocale(localeContext: $localeContext) {
                displayName
                defaultValueFloat: defaultValue
              }
            }
            
            # Dropdown specific
            ... on DropdownSharedProductModifier {
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
            ... on RadioButtonsSharedProductModifier {
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
            ... on RectangleListSharedProductModifier {
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
            ... on SwatchSharedProductModifier {
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
            
            # DateField specific
            ... on DateFieldSharedProductModifier {
              overridesForLocale(localeContext: $localeContext) {
                displayName
              }
            }
            
            # FileUpload specific
            ... on FileUploadSharedProductModifier {
              overridesForLocale(localeContext: $localeContext) {
                displayName
              }
            }
          }
        }
      }
    }
  }
`);

// Set Shared Product Modifiers Information Mutation
export const SetSharedProductModifiersInformationDocument = graphql(`
  mutation SetSharedProductModifiersInformation($input: SetSharedProductModifiersInformationInput!) {
    sharedProductModifiers {
      setSharedProductModifiersInformation(input: $input) {
        sharedProductModifiers {
          id
          displayName
          isRequired
          __typename
        }
      }
    }
  }
`);

// Helper function to create variables for getting shared modifiers
export function createGetSharedProductModifiersVariables(params: {
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

// Helper function to create variables for setting shared modifiers
export function createSetSharedProductModifiersVariables(params: {
  channelId: number;
  locale: string;
  modifiers: Array<{
    modifierId: string;
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
        modifiers: params.modifiers.map(modifier => ({
          modifierId: modifier.modifierId,
          data: modifier.data
        }))
      }
    }
  };
}

