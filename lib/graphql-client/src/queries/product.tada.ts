import { graphql, ResultOf } from "../graphql";
import { formatChannelId, formatProductId } from "../utils";

// Get All Products Query
export const GetAllProductsDocument = graphql(`
  query GetAllProducts($limit: Int!, $cursor: String) {
    store {
      __typename
      products(first: $limit, after: $cursor) {
          __typename
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
              node {
                  id
                  basicInformation {
                      description
                      name
                  }
                  seoInformation {
                      metaDescription
                      pageTitle
                  }
                  storefrontDetails {
                      warranty
                      availabilityDescription
                      searchKeywords
                  }
                  preOrderSettings {
                      message
                  }
                  images {
                      edges {
                          node {
                              id
                              altText
                              isThumbnail
                              sortOrder
                              dateCreated
                              dateModified
                              imageFile
                              urlZoom
                              urlStandard
                              addedToProduct
                          }
                      }
                  }
              }
          }
      }
    }
  }
`);

// Get Product Locale Data Query
export const GetProductLocaleDataDocument = graphql(`
  query GetProductLocaleData(
    $productId: ID!
    $channelId: ID!
    $locale: String!
    $optionsAfter: String
    $modifiersAfter: String
    $customFieldsAfter: String
  ) {
    store {
      __typename
      product(id: $productId) {
        __typename
        id
        basicInformation {
          name
          description
        }
        seoInformation {
          pageTitle
          metaDescription
        }
        storefrontDetails {
          warranty
          availabilityDescription
          searchKeywords
        }
        preOrderSettings {
          message
        }
        options(first: 10, after: $optionsAfter) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              __typename
              id
              isShared
              displayName
              values {
                id
                label
                isDefault
              }
              overridesForLocale (localeContext: { channelId: $channelId, locale: $locale }) {
                displayName
                values {
                  id
                  label
                }
              }
            }
          }
        }
        modifiers(first: 10, after: $modifiersAfter) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              __typename
              id
              isRequired
              isShared
              displayName
              ... on CheckboxProductModifier {
                checkedByDefault
                fieldValue
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                  ... on CheckboxProductModifierForLocale {
                    fieldValue
                  }
                }
              }
              ... on TextFieldProductModifier {
                defaultValue
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                  ... on TextFieldProductModifierForLocale {
                    defaultValue
                  }
                }
              }
              ... on MultilineTextFieldProductModifier {
                defaultValue
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                  ... on MultilineTextFieldProductModifierForLocale {
                    defaultValue
                  }
                }
              }
              ... on NumbersOnlyTextFieldProductModifier {
                defaultValueFloat: defaultValue
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                  ... on NumbersOnlyTextFieldProductModifierForLocale {
                    defaultValueFloat: defaultValue
                  }
                }
              }
              ... on DropdownProductModifier {
                values {
                  id
                  label
                  isDefault
                }
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                  values {
                    id
                    label
                  }
                }
              }
              ... on RadioButtonsProductModifier {
                values {
                  id
                  label
                  isDefault
                }
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                  values {
                    id
                    label
                  }
                }
              }
              ... on RectangleListProductModifier {
                values {
                  id
                  label
                  isDefault
                }
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                  values {
                    id
                    label
                  }
                }
              }
              ... on SwatchProductModifier {
                values {
                  id
                  label
                  isDefault
                }
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                  values {
                    id
                    label
                  }
                }
              }
              ... on PickListProductModifier {
                values {
                  id
                  label
                  isDefault
                }
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                  values {
                    id
                    label
                  }
                }
              }
              ... on FileUploadProductModifier {
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                }
              }
              ... on DateFieldProductModifier {
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                  displayName
                }
              }
            }
          }
        }
        customFields(first: 10, after: $customFieldsAfter) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              name
              value
              overrides (context: { channelId: $channelId, locale: $locale }) {
                edges {
                  node {
                    ... on ProductCustomFieldOverridesForChannelLocale {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
        }
        overridesForLocale(
          localeContext: { channelId: $channelId, locale: $locale }
        ) {
          basicInformation {
            description
            name
          }
          seoInformation {
            metaDescription
            pageTitle
          }
          storefrontDetails {
            warranty
            availabilityDescription
            searchKeywords
          }
          preOrderSettings {
            message
          }
          urlPath {
            path
          }
        }
      }
    }
  }
`);

// These fragments are used only to bypass the "infinite recursion" error in GraphQL.tada

const ProductCustomFieldOverridesFragment = graphql(`
  fragment ProductCustomFieldOverridesFragment on ProductCustomFieldOverrides @_unmask {
    ... on ProductCustomFieldOverridesForChannelLocale {
      name
      value
    }
  }
`);

const PickListModifierValueForLocaleFragment = graphql(`
  fragment PickListModifierValueForLocaleFragment on PickListProductModifierForLocale @_unmask {
      values {
        id
        label
      }
  }
`);

// Update Product Locale Data Mutation
export const UpdateProductLocaleDataDocument = graphql(`
  mutation UpdateProductLocaleData(
    $channelId: ID!
    $locale: String!
    $basicInput: SetProductBasicInformationInput!
    $seoInput: SetProductSeoInformationInput!
    $preOrderInput: SetProductPreOrderSettingsInput!
    $storefrontInput: SetProductStorefrontDetailsInput!
    $optionsInput: SetProductOptionsInformationInput!
    $modifiersInput: SetProductModifiersInformationInput!
    $customFieldsInput: UpdateProductCustomFieldsInput!
    $hasBasicInput: Boolean!
    $hasSeoInput: Boolean!
    $hasPreOrderInput: Boolean!
    $hasStorefrontInput: Boolean!
    $hasOptionsInput: Boolean!
    $hasModifiersInput: Boolean!
    $hasCustomFieldsInput: Boolean!
  ) {
    product {
      setProductBasicInformation(input: $basicInput) @include(if: $hasBasicInput) {
        product {
          overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
            basicInformation {
              name
              description
            }
          }
        }
      }
      setProductSeoInformation(input: $seoInput) @include(if: $hasSeoInput) {
        product {
          overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
            seoInformation {
              pageTitle
              metaDescription
            }
          }
        }
      }
      setProductPreOrderSettings(input: $preOrderInput) @include(if: $hasPreOrderInput) {
        product {
          overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
            preOrderSettings {
              message
            }
          }
        }
      }
      setProductStorefrontDetails(input: $storefrontInput) @include(if: $hasStorefrontInput) {
        product {
          overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
            storefrontDetails {
              warranty
              availabilityDescription
              searchKeywords
            }
          }
        }
      }
      setProductOptionsInformation(input: $optionsInput) @include(if: $hasOptionsInput) {
        product {
          id
          options {
            edges {
              node {
                __typename
                id
                overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
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
      setProductModifiersInformation(input: $modifiersInput) @include(if: $hasModifiersInput) {
        product {
          id
          modifiers { 
            edges {
              node {
                __typename
                id
                displayName
                ... on CheckboxProductModifier {
                  fieldValue
                  overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                    fieldValue
                  }
                }
                ... on TextFieldProductModifier {
                  defaultValue
                  overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                    defaultValue
                  }
                }
                ... on MultilineTextFieldProductModifier {
                  defaultValue
                  overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                    defaultValue
                  }
                }
                ... on NumbersOnlyTextFieldProductModifier {
                  defaultValueFloat: defaultValue
                  overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                    defaultValueFloat: defaultValue
                  }
                }
                ... on DropdownProductModifier {
                  values {
                    id
                    label
                  }
                  overridesForLocale(localeContext: {channelId: $channelId, locale: $locale}) {
                    values {
                      id
                      label
                    }
                  }
                }
                ... on RadioButtonsProductModifier {
                  values {
                    id
                    label
                  }
                  overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                    values {
                      id
                      label
                    }
                  }
                }
                ... on RectangleListProductModifier {
                  values {
                    id
                    label
                  }
                  overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                    values {
                      id
                      label
                    }
                  }
                }
                ... on SwatchProductModifier {
                  values {
                    id
                    label
                  }
                  overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                    values {
                      id
                      label
                    }
                  }
                }
                ... on PickListProductModifier {
                  values {
                    id
                    label
                  }
                  overridesForLocale(localeContext: { channelId: $channelId, locale: $locale }) {
                    ... PickListModifierValueForLocaleFragment
                  }
                }
              }
            }
          }
        }
      }
      updateProductCustomFields(input: $customFieldsInput) @include(if: $hasCustomFieldsInput) {
        product {
          customFields {
            edges {
              node {
                overrides(context: { channelId: $channelId, locale: $locale }) {
                  edges {
                    node {
                      ... ProductCustomFieldOverridesFragment
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`, [ProductCustomFieldOverridesFragment, PickListModifierValueForLocaleFragment]);

// Helper function to create variables for GetAllProducts query
export function createGetAllProductsVariables(params: {
  limit: number;
  cursor?: string;
}) {
  return {
    limit: params.limit,
    cursor: params.cursor,
  };
}

// Helper function to create variables for GetProductLocaleData query
export function createGetProductLocaleDataVariables(params: {
  pid: number;
  channelId: number;
  locale: string;
  optionsAfter?: string | null;
  modifiersAfter?: string | null;
  customFieldsAfter?: string | null;
}) {
  return {
    productId: formatProductId(params.pid),
    channelId: formatChannelId(params.channelId),
    locale: params.locale,
    optionsAfter: params.optionsAfter ?? null,
    modifiersAfter: params.modifiersAfter ?? null,
    customFieldsAfter: params.customFieldsAfter ?? null,
  };
}
