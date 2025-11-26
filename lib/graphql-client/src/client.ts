import debug from "debug";
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_AFTER_MS,
  adminApiHostname,
  graphqlApiDomain,
} from "./constants";
import type {
  GraphQLClientConfig,
  FetcherRequestInit,
  ComplexityConfig,
} from "./types/config";
import {
  BigCommerceGraphQLError,
  RateLimitError,
  ComplexityLimitError,
} from "./types/errors";
import {
  AppExtension,
  AppExtensionContext,
  AppExtensionLabel,
  AppExtensionModel,
  ProductLocaleQueryOptions,
  ProductLocaleUpdateOptions,
} from "./types";
import { UpdateProductLocaleDataVariables } from "./types/product";
import {
  GetAppExtensionsDocument,
  CreateAppExtensionDocument,
  UpdateAppExtensionDocument,
  DeleteAppExtensionDocument,
  createAppExtensionInput,
  updateAppExtensionInput,
} from "./queries/app-extension.tada";
import {
  GetAllProductsDocument,
  GetProductLocaleDataDocument,
  createGetAllProductsVariables,
  createGetProductLocaleDataVariables,
} from "./queries/product.tada";
import {
  GetCategoryTranslationsDocument,
  UpdateCategoryTranslationsDocument,
  DeleteCategoryTranslationsDocument,
  createGetCategoryTranslationsVariables,
  createUpdateCategoryTranslationsVariables,
  createDeleteCategoryTranslationsVariables,
} from "./queries/category.tada";
import {
  GetSharedProductModifiersDocument,
  SetSharedProductModifiersInformationDocument,
  createGetSharedProductModifiersVariables,
  createSetSharedProductModifiersVariables,
} from "./queries/shared-modifiers.tada";
import {
  GetSharedProductOptionsDocument,
  SetSharedProductOptionsInformationDocument,
  createGetSharedProductOptionsVariables,
  createSetSharedProductOptionsVariables,
} from "./queries/shared-options.tada";
import { graphql } from "./graphql";
import type { ResultOf, VariablesOf } from "./graphql";
import type { GraphQLResponse } from "./types/graphql";
import { DocumentNode, parse, print } from "graphql";
import { UpdateProductLocaleDataDocument } from "./queries/product.tada";
import { formatChannelId, formatProductId } from "./utils";

export class GraphQLClient {
  private baseUrl: string;
  private headers: Headers;
  private maxRetries: number;
  private failOnLimitReached: boolean;
  private logger: debug.Debugger;
  private beforeRequest?: GraphQLClientConfig["beforeRequest"];
  private afterResponse?: GraphQLClientConfig["afterResponse"];
  private complexityConfig?: ComplexityConfig;

  constructor({
    accessToken,
    storeHash,
    maxRetries = DEFAULT_MAX_RETRIES,
    failOnLimitReached = false,
    apiDomain = graphqlApiDomain,
    apiHostname = adminApiHostname,
    beforeRequest,
    afterResponse,
    complexity,
  }: GraphQLClientConfig) {
    this.baseUrl = `https://${apiHostname}/stores/${storeHash}/graphql`;
    this.headers = new Headers({
      "X-Auth-Token": accessToken,
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    this.maxRetries = maxRetries;
    this.failOnLimitReached = failOnLimitReached;
    this.beforeRequest = beforeRequest;
    this.afterResponse = afterResponse;
    this.complexityConfig = complexity;
    this.logger = debug("bigcommerce:graphql");

    this.logger("Client initialized:", {
      storeHash,
      hasAccessToken: !!accessToken,
      maxRetries,
      failOnLimitReached,
      apiDomain,
      apiHostname,
      hasComplexityConfig: !!complexity,
    });
  }

  private createError(
    message: string,
    response: Response,
    data?: any
  ): BigCommerceGraphQLError {
    const error = new Error(message) as BigCommerceGraphQLError;
    error.response = response;
    error.status = response.status;

    if (data?.errors) {
      error.errors = data.errors;
    }

    return error;
  }

  private handleComplexityHeader(requestId: string, response: Response): void {
    if (!this.complexityConfig) return;

    const complexity = parseInt(
      response.headers.get("x-bc-graphql-complexity") || "0",
      10
    );

    this.logger("[%s] Complexity:", requestId, { complexity });

    // Notify via callback if configured
    if (this.complexityConfig.onComplexityUpdate) {
      this.complexityConfig.onComplexityUpdate(complexity);
    }
  }

  private async handleRateLimit(
    requestId: string,
    response: Response,
    retryCount: number = 0
  ): Promise<void> {
    const retryAfterMs = parseInt(
      response.headers.get("X-Rate-Limit-Time-Reset-Ms") ||
        String(DEFAULT_RETRY_AFTER_MS),
      10
    );

    // Get quota information from headers
    const quota = response.headers.get("X-Rate-Limit-Requests-Quota");
    const remaining = response.headers.get("X-Rate-Limit-Requests-Left");
    const timeWindow = response.headers.get("X-Rate-Limit-Time-Window-Ms");

    this.logger("[%s] Hit Rate Limit:", requestId, {
      quota,
      remaining,
      timeWindow,
      retryAfterMs,
      retryCount,
    });

    if (this.failOnLimitReached) {
      const error = new Error(
        `Rate limit reached. Retry after ${Math.ceil(
          retryAfterMs / 1000
        )} seconds`
      ) as RateLimitError;
      error.retryAfter = Math.ceil(retryAfterMs / 1000);
      this.logger(
        "[%s] Failing request without retrying since failOnLimitReached is true.",
        requestId
      );
      throw error;
    }

    if (retryCount >= this.maxRetries) {
      const error = new Error(
        `Rate limit reached. Max retries (${this.maxRetries}) exceeded.`
      ) as RateLimitError;
      error.retryAfter = Math.ceil(retryAfterMs / 1000);
      this.logger(
        `[%s] Failing request without retrying since max retries (${this.maxRetries}) exceeded.`,
        requestId
      );
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
  }

  private headersToObject(headers: Headers): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  private generateRequestId(): string {
    return `req_${Math.random().toString(36).substring(2, 15)}`;
  }

  async request<T>(
    query:
      | string
      | { query: string; variables?: Record<string, any> }
      | ReturnType<typeof graphql>,
    variables: Record<string, any> = {},
    retryCount: number = 0
  ): Promise<GraphQLResponse<T>> {
    const requestId = this.generateRequestId();
    const queryStr =
      typeof query === "string"
        ? query
        : "raw" in query
        ? query.raw
        : query.query;
    const vars =
      typeof query === "string"
        ? variables
        : { ...("variables" in query ? query.variables : {}), ...variables };

    let requestInit: RequestInit = {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        query: queryStr,
        variables: vars,
      }),
      redirect: "follow",
    };

    // Apply beforeRequest hook if defined
    if (this.beforeRequest) {
      const modifiedOptions = await this.beforeRequest(
        requestInit as FetcherRequestInit
      );
      if (modifiedOptions) {
        requestInit = {
          ...requestInit,
          ...modifiedOptions,
          body: JSON.stringify(modifiedOptions.body || requestInit.body),
        };
      }
    }

    this.logger("[%s] Request Query: %j", requestId, queryStr);
    this.logger("[%s] Request Variables: %j", requestId, vars);

    const response = await fetch(this.baseUrl, requestInit);

    // Apply onComplexityUpdate callback if defined
    this.handleComplexityHeader(requestId, response);

    // Apply afterResponse hook if defined
    if (this.afterResponse) {
      await this.afterResponse(response);
    }

    this.logger(
      `[%s] Response Status:`,
      requestId,
      `${response.status} ${response.statusText}`
    );
    this.logger(
      `[%s] Response Headers: %j`,
      requestId,
      this.headersToObject(response.headers)
    );
    const responseBody = await response.clone().json();
    this.logger(`[%s] Response Body: %j`, requestId, responseBody);

    // Handle rate limiting
    if (response.status === 429) {
      await this.handleRateLimit(requestId, response, retryCount);
      return this.request(query, variables, retryCount + 1);
    }

    if (!response.ok) {
      throw this.createError(
        `HTTP ${response.status} ${response.statusText}`,
        response,
        responseBody
      );
    }

    const data = responseBody;

    // Handle GraphQL errors
    if (data.errors?.length > 0) {
      const error = this.createError(data.errors[0].message, response, data);
      this.logger(`[%s] Errors: %j`, requestId, data.errors);
      throw error;
    }

    return data as GraphQLResponse<T>;
  }

  // App Extensions
  async getAppExtensions(): Promise<AppExtension[]> {
    this.logger("Fetching app extensions");
    type Response = ResultOf<typeof GetAppExtensionsDocument>;
    const response = await this.request<Response>({
      query: print(GetAppExtensionsDocument),
    });
    const data = response.data;
    const edges = data.store.appExtensions?.edges;
    if (!edges) return [];
    return edges
      .map((edge) => edge?.node)
      .filter((node): node is NonNullable<typeof node> => node !== null)
      .map((node) => ({
        ...node,
        context: node.context || null,
        model: node.model || null,
      }));
  }

  async createAppExtension(params: {
    context: AppExtensionContext;
    model: AppExtensionModel;
    url: string;
    label: AppExtensionLabel;
  }): Promise<string> {
    this.logger("Creating app extension");
    const variables = createAppExtensionInput(params);
    type Response = ResultOf<typeof CreateAppExtensionDocument>;
    const response = await this.request<Response>(
      { query: print(CreateAppExtensionDocument) },
      variables
    );
    const data = response.data;
    const extension = data.appExtension?.createAppExtension?.appExtension;
    if (!extension?.id) {
      throw new Error("Failed to create app extension");
    }
    return extension.id;
  }

  async updateAppExtension(params: {
    id: string;
    input: { label: AppExtensionLabel };
  }): Promise<AppExtension> {
    this.logger("Updating app extension id=%s", params.id);
    const variables = updateAppExtensionInput({
      id: params.id,
      label: params.input.label,
    });
    type Response = ResultOf<typeof UpdateAppExtensionDocument>;
    const response = await this.request<Response>(
      { query: print(UpdateAppExtensionDocument) },
      variables
    );
    const data = response.data;
    const extension = data.appExtension?.updateAppExtension?.appExtension;
    if (!extension) {
      throw new Error("Failed to update app extension");
    }
    return {
      ...extension,
      context: extension.context || null,
      model: extension.model || null,
    };
  }

  async deleteAppExtension(id: string): Promise<string> {
    this.logger("Deleting app extension id=%s", id);
    type Response = ResultOf<typeof DeleteAppExtensionDocument>;
    const response = await this.request<Response>(
      { query: print(DeleteAppExtensionDocument) },
      { id }
    );
    const data = response.data;
    const deletedId =
      data.appExtension?.deleteAppExtension?.deletedAppExtensionId;
    if (!deletedId) {
      throw new Error("Failed to delete app extension");
    }
    return deletedId;
  }

  async upsertAppExtension(
    params: {
      context: AppExtensionContext;
      model: AppExtensionModel;
      url: string;
      label: AppExtensionLabel;
    },
    options?: {
      cleanupDuplicates?: boolean;
    }
  ): Promise<string> {
    this.logger("Upserting app extension");
    try {
      const extensions = await this.getAppExtensions();
      const matchingExtensions = extensions.filter(
        (ext) =>
          ext.context === params.context &&
          ext.model === params.model &&
          ext.url === params.url
      );

      // Handle cleanup of duplicates if enabled and there are multiple matches
      if (options?.cleanupDuplicates && matchingExtensions.length > 1) {
        this.logger("Cleaning up duplicate app extensions");
        // Keep the last extension, delete all others
        const [extensionsToDelete, [extensionToKeep]] = [
          matchingExtensions.slice(0, -1),
          matchingExtensions.slice(-1),
        ];

        await Promise.all(
          extensionsToDelete.map(async (ext) => this.deleteAppExtension(ext.id))
        );

        // Update the remaining extension
        await this.updateAppExtension({
          id: extensionToKeep.id,
          input: { label: params.label },
        });

        return extensionToKeep.id;
      }

      // Handle single match or no cleanup requested
      const existingExtension = matchingExtensions[0];
      if (existingExtension) {
        await this.updateAppExtension({
          id: existingExtension.id,
          input: { label: params.label },
        });
        return existingExtension.id;
      } else {
        return await this.createAppExtension(params);
      }
    } catch (error) {
      this.logger("Error in upsertAppExtension:", error);
      throw error;
    }
  }

  // Product Methods
  async getProductLocaleData(options: ProductLocaleQueryOptions) {
    type Response = ResultOf<typeof GetProductLocaleDataDocument>;
    type ProductType = NonNullable<Response["store"]>["product"];

    // Fetch all pages for options, modifiers, and customFields
    let optionsAfter: string | null = null;
    let modifiersAfter: string | null = null;
    let customFieldsAfter: string | null = null;
    
    let allOptionsEdges: any[] = [];
    let allModifiersEdges: any[] = [];
    let allCustomFieldsEdges: any[] = [];
    
    let productData: ProductType | null = null;

    // Fetch options with pagination
    while (true) {
      const variables = createGetProductLocaleDataVariables({
        pid: options.pid,
        channelId: options.channelId,
        locale: options.locale,
        optionsAfter,
        modifiersAfter: null, // Only fetch modifiers on first call
        customFieldsAfter: null, // Only fetch customFields on first call
      });

      const response = await this.request({
        query: print(GetProductLocaleDataDocument),
        variables,
      });
      const typedResponse = response as unknown as {
        data: { store: { product: ProductType } };
      };

      if (!typedResponse.data?.store?.product) {
        throw new Error("Product not found");
      }

      const product = typedResponse.data.store.product;
      
      // Store product data on first call
      if (!productData) {
        productData = product;
      }

      // Collect options edges
      if (product.options?.edges) {
        allOptionsEdges.push(...product.options.edges);
      }

      // Check if there are more options pages
      if (product.options?.pageInfo?.hasNextPage && product.options.pageInfo.endCursor) {
        optionsAfter = product.options.pageInfo.endCursor;
      } else {
        break;
      }
    }

    // Reset cursors and fetch modifiers with pagination
    modifiersAfter = null;
    while (true) {
      const variables = createGetProductLocaleDataVariables({
        pid: options.pid,
        channelId: options.channelId,
        locale: options.locale,
        optionsAfter: null, // Options already fetched
        modifiersAfter,
        customFieldsAfter: null, // Only fetch customFields on first call
      });

      const response = await this.request({
        query: print(GetProductLocaleDataDocument),
        variables,
      });
      const typedResponse = response as unknown as {
        data: { store: { product: ProductType } };
      };

      const product = typedResponse.data.store.product;

      if (!product) {
        break;
      }

      // Collect modifiers edges
      if (product.modifiers?.edges) {
        allModifiersEdges.push(...product.modifiers.edges);
      }

      // Check if there are more modifiers pages
      if (product.modifiers?.pageInfo?.hasNextPage && product.modifiers.pageInfo.endCursor) {
        modifiersAfter = product.modifiers.pageInfo.endCursor;
      } else {
        break;
      }
    }

    // Reset cursors and fetch customFields with pagination
    customFieldsAfter = null;
    while (true) {
      const variables = createGetProductLocaleDataVariables({
        pid: options.pid,
        channelId: options.channelId,
        locale: options.locale,
        optionsAfter: null, // Options already fetched
        modifiersAfter: null, // Modifiers already fetched
        customFieldsAfter,
      });

      const response = await this.request({
        query: print(GetProductLocaleDataDocument),
        variables,
      });
      const typedResponse = response as unknown as {
        data: { store: { product: ProductType } };
      };

      const product = typedResponse.data.store.product;

      if (!product) {
        break;
      }

      // Collect customFields edges
      if (product.customFields?.edges) {
        allCustomFieldsEdges.push(...product.customFields.edges);
      }

      // Check if there are more customFields pages
      if (product.customFields?.pageInfo?.hasNextPage && product.customFields.pageInfo.endCursor) {
        customFieldsAfter = product.customFields.pageInfo.endCursor;
      } else {
        break;
      }
    }

    // Merge all paginated results into the product data
    if (productData) {
      return {
        ...productData,
        options: {
          ...productData.options,
          edges: allOptionsEdges,
        },
        modifiers: {
          ...productData.modifiers,
          edges: allModifiersEdges,
        },
        customFields: {
          ...productData.customFields,
          edges: allCustomFieldsEdges,
        },
      };
    }

    throw new Error("Product not found");
  }

  async NOTADA_updateProductLocaleData(
    variables: UpdateProductLocaleDataVariables
  ) {
    // Check for inputs: Basic Info
    const hasBasicInfo =
      variables.input?.data &&
      (variables.input.data.name || variables.input.data.description);

    const hasRemovedBasicInfo =
      variables.removedBasicInfoInput &&
      variables.removedBasicInfoInput.overridesToRemove &&
      variables.removedBasicInfoInput.overridesToRemove.length > 0;

    // Check for inputs: SEO
    const hasSeo =
      variables.seoInput?.data &&
      (variables.seoInput.data.pageTitle ||
        variables.seoInput.data.metaDescription);

    const hasRemovedSeo =
      variables.removedSeoInput &&
      variables.removedSeoInput.overridesToRemove &&
      variables.removedSeoInput.overridesToRemove.length > 0;

    // Check for inputs: Storefront Details
    const hasStorefrontDetails =
      variables.storefrontInput?.data &&
      (variables.storefrontInput.data.warranty ||
        variables.storefrontInput.data.availabilityDescription ||
        variables.storefrontInput.data.searchKeywords);

    const hasRemovedStorefrontDetails =
      variables.removedStorefrontDetailsInput &&
      variables.removedStorefrontDetailsInput.overridesToRemove &&
      variables.removedStorefrontDetailsInput.overridesToRemove.length > 0;

    // Check for inputs: Pre Order
    const hasPreOrder =
      variables.preOrderInput?.data && variables.preOrderInput.data.message;

    const hasRemovedPreOrder =
      variables.removedPreOrderInput &&
      variables.removedPreOrderInput.overridesToRemove &&
      variables.removedPreOrderInput.overridesToRemove.length > 0;

    // Check for inputs: Custom Fields
    const hasRemovedCustomFields =
      variables.removedCustomFieldsInput &&
      variables.removedCustomFieldsInput.data &&
      variables.removedCustomFieldsInput.data.length > 0;

    const hasCustomFields =
      variables.customFieldsInput &&
      variables.customFieldsInput.data &&
      variables.customFieldsInput.data.length > 0;

    // Check for inputs: Options
    const hasOptions =
      variables.optionsInput &&
      variables.optionsInput.data &&
      variables.optionsInput.data.options &&
      variables.optionsInput.data.options.length > 0;

    const hasRemovedOptions =
      variables.removedOptionsInput &&
      variables.removedOptionsInput.data &&
      variables.removedOptionsInput.data.options &&
      variables.removedOptionsInput.data.options.length > 0;

    // Check for inputs: Modifiers
    const hasModifiers =
      variables.modifiersInput &&
      variables.modifiersInput.data &&
      variables.modifiersInput.data.modifiers &&
      variables.modifiersInput.data.modifiers.length > 0;

    const hasRemovedModifiers =
      variables.removedModifiersInput &&
      variables.removedModifiersInput.data &&
      variables.removedModifiersInput.data.modifiers &&
      variables.removedModifiersInput.data.modifiers.length > 0;

    // Check if there are any removals or updates to make
    const hasAnyRemovals =
      hasRemovedBasicInfo ||
      hasRemovedSeo ||
      hasRemovedStorefrontDetails ||
      hasRemovedPreOrder ||
      hasRemovedOptions ||
      hasRemovedModifiers ||
      hasRemovedCustomFields;

    const hasAnyUpdates =
      hasBasicInfo ||
      hasSeo ||
      hasStorefrontDetails ||
      hasPreOrder ||
      hasOptions ||
      hasModifiers ||
      hasCustomFields;

    // If no updates or removals, return early
    if (!hasAnyRemovals && !hasAnyUpdates) {
      return { data: {} };
    }

    const removalMutations = hasAnyRemovals
      ? {
          query: `
        mutation (
          ${
            hasRemovedBasicInfo
              ? "$removedBasicInfoInput: RemoveProductBasicInformationOverridesInput!,"
              : ""
          }
          ${
            hasRemovedSeo
              ? "$removedSeoInput: RemoveProductSeoInformationOverridesInput!,"
              : ""
          }
          ${
            hasRemovedStorefrontDetails
              ? "$removedStorefrontDetailsInput: RemoveProductStorefrontDetailsOverridesInput!,"
              : ""
          }
          ${
            hasRemovedPreOrder
              ? "$removedPreOrderInput: RemoveProductPreOrderSettingsOverridesInput!,"
              : ""
          }
          ${
            hasRemovedOptions
              ? "$removedOptionsInput: RemoveProductOptionsOverridesInput!,"
              : ""
          }
          ${
            hasRemovedModifiers
              ? "$removedModifiersInput: RemoveProductModifiersOverridesInput!,"
              : ""
          }
          ${
            hasRemovedCustomFields
              ? "$removedCustomFieldsInput: RemoveProductCustomFieldsOverridesInput!"
              : ""
          }
        ) {
          product {
            ${
              hasRemovedBasicInfo
                ? `
            removeProductBasicInformationOverrides(input: $removedBasicInfoInput) {
              product { id }
            }`
                : ""
            }
            ${
              hasRemovedSeo
                ? `
            removeProductSeoInformationOverrides(input: $removedSeoInput) {
              product { id }
            }`
                : ""
            }
            ${
              hasRemovedStorefrontDetails
                ? `
            removeProductStorefrontDetailsOverrides(input: $removedStorefrontDetailsInput) {
              product { id }
            }`
                : ""
            }
            ${
              hasRemovedPreOrder
                ? `
            removeProductPreOrderSettingsOverrides(input: $removedPreOrderInput) {
              product { id }
            }`
                : ""
            }
            ${
              hasRemovedOptions
                ? `
            removeProductOptionsOverrides(input: $removedOptionsInput) {
              product { id }
            }`
                : ""
            }
            ${
              hasRemovedModifiers
                ? `
            removeProductModifiersOverrides(input: $removedModifiersInput) {
              product { id }
            }`
                : ""
            }
            ${
              hasRemovedCustomFields
                ? `
            removeProductCustomFieldsOverrides(input: $removedCustomFieldsInput) {
              product { id }
            }`
                : ""
            }
          }
        }
      `,
          variables: {
            ...(hasRemovedBasicInfo && {
              removedBasicInfoInput: variables.removedBasicInfoInput,
            }),
            ...(hasRemovedSeo && {
              removedSeoInput: variables.removedSeoInput,
            }),
            ...(hasRemovedStorefrontDetails && {
              removedStorefrontDetailsInput:
                variables.removedStorefrontDetailsInput,
            }),
            ...(hasRemovedPreOrder && {
              removedPreOrderInput: variables.removedPreOrderInput,
            }),
            ...(hasRemovedOptions && {
              removedOptionsInput: variables.removedOptionsInput,
            }),
            ...(hasRemovedModifiers && {
              removedModifiersInput: variables.removedModifiersInput,
            }),
            ...(hasRemovedCustomFields && {
              removedCustomFieldsInput: variables.removedCustomFieldsInput,
            }),
          },
        }
      : null;

    const updateMutations = hasAnyUpdates
      ? {
          query: `
        mutation (
          $channelId: ID!,
          $locale: String!,
          ${hasBasicInfo ? "$input: SetProductBasicInformationInput!," : ""}
          ${hasSeo ? "$seoInput: SetProductSeoInformationInput!," : ""}
          ${
            hasPreOrder
              ? "$preOrderInput: SetProductPreOrderSettingsInput!,"
              : ""
          }
          ${
            hasStorefrontDetails
              ? "$storefrontInput: SetProductStorefrontDetailsInput!,"
              : ""
          }
          ${
            hasOptions
              ? "$optionsInput: SetProductOptionsInformationInput!,"
              : ""
          }
          ${
            hasModifiers
              ? "$modifiersInput: SetProductModifiersInformationInput!,"
              : ""
          }
          ${
            hasCustomFields
              ? "$customFieldsInput: UpdateProductCustomFieldsInput!"
              : ""
          }
        ) {
          product {
            ${
              hasBasicInfo
                ? `
            setProductBasicInformation(input: $input) {
              product {
                id
                overridesForLocale (localeContext: { channelId: $channelId, locale: $locale }) {
                  basicInformation {
                    name
                    description
                  }
                }
              }
            }`
                : ""
            }
            ${
              hasSeo
                ? `
            setProductSeoInformation(input: $seoInput) {
              product {
                id
                overridesForLocale (localeContext: { channelId: $channelId, locale: $locale }) {
                  seoInformation {
                    pageTitle
                    metaDescription
                  }
                }
              }
            }`
                : ""
            }
            ${
              hasPreOrder
                ? `
            setProductPreOrderSettings(input: $preOrderInput) {
              product {
                overridesForLocale (localeContext: { channelId: $channelId, locale: $locale }) {
                  preOrderSettings {
                    message
                  }
                }
              }
            }`
                : ""
            }
            ${
              hasStorefrontDetails
                ? `
            setProductStorefrontDetails(input: $storefrontInput) {
              product {
                overridesForLocale (localeContext: { channelId: $channelId, locale: $locale }) {
                  storefrontDetails {
                    warranty
                    availabilityDescription
                    searchKeywords
                  }
                }
              }
            }`
                : ""
            }
            ${
              hasOptions
                ? `
            setProductOptionsInformation (input: $optionsInput) {
              product {
                id
                options {
                  edges {
                    node {
                      id
                      overridesForLocale(
                        localeContext: {
                          channelId: $channelId,
                          locale: $locale
                        }
                      ) {
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
            `
                : ""
            }
            ${
              hasModifiers
                ? `
            setProductModifiersInformation (input: $modifiersInput) {
              product {
                id
                modifiers {
                  edges {
                    node {
                      __typename
                      id
                      ... on CheckboxProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                          fieldValue
                        }
                      }
                      ... on TextFieldProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                          defaultValue
                        }
                      }
                      ... on MultilineTextFieldProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                          defaultValue
                        }
                      }
                      ... on NumbersOnlyTextFieldProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                          defaultValueFloat: defaultValue
                        }
                      }
                      ... on DropdownProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                          values {
                            id
                            label
                          }
                        }
                      }
                      ... on RadioButtonsProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                          values {
                            id
                            label
                          }
                        }
                      }
                      ... on RectangleListProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                          values {
                            id
                            label
                          }
                        }
                      }
                      ... on SwatchProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                          values {
                            id
                            label
                          }
                        }
                      }
                      ... on PickListProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                          values {
                            id
                            label
                          }
                        }
                      }
                      ... on FileUploadProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                        }
                      }
                      ... on DateFieldProductModifier {
                        overridesForLocale(
                          localeContext: {
                            channelId: $channelId,
                            locale: $locale
                          }
                        ) {
                          displayName
                        }
                      }
                    }
                  }
                }
              }
            }
            `
                : ""
            }
            ${
              hasCustomFields
                ? `
            updateProductCustomFields(input: $customFieldsInput) {
              product {
                customFields {
                  edges {
                    node {
                      id
                      name
                      value
                      overrides(context: { channelId: $channelId, locale: $locale }) {
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
              }
            }
            `
                : ""
            }
          }
        }
      `,
          variables: {
            channelId: variables.channelId,
            locale: variables.locale,
            ...(hasBasicInfo && { input: variables.input }),
            ...(hasSeo && { seoInput: variables.seoInput }),
            ...(hasPreOrder && { preOrderInput: variables.preOrderInput }),
            ...(hasStorefrontDetails && {
              storefrontInput: variables.storefrontInput,
            }),
            ...(hasOptions && { optionsInput: variables.optionsInput }),
            ...(hasModifiers && { modifiersInput: variables.modifiersInput }),
            ...(hasCustomFields && {
              customFieldsInput: variables.customFieldsInput,
            }),
          },
        }
      : null;

    // Run mutations in parallel if there are operations to perform
    const promises = [];

    if (removalMutations) {
      promises.push(this.request(removalMutations));
    }
    if (updateMutations) {
      promises.push(this.request(updateMutations));
    }

    // If no mutations to run, return empty response
    if (promises.length === 0) {
      return { data: {} };
    }

    const results = await Promise.all(promises);

    // Combine the responses
    return results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
  }

  async updateProductLocaleData(options: ProductLocaleUpdateOptions) {
    type Response = ResultOf<typeof UpdateProductLocaleDataDocument>;
    type ProductType = NonNullable<Response["product"]>;

    const productId = formatProductId(options.productId);
    const channelId = formatChannelId(options.channelId);
    const locale = options.locale;

    const basicInput = {
      productId,
      localeContext: {
        channelId,
        locale,
      },
      data: {
        name: options.productData?.name,
        description: options.productData?.description,
      },
    };
    const hasBasicInput = Boolean(
      options.productData?.name || options.productData?.description
    );

    const seoInput = {
      productId,
      localeContext: {
        channelId,
        locale,
      },
      data: {
        pageTitle: options.productData?.pageTitle,
        metaDescription: options.productData?.metaDescription,
      },
    };
    const hasSeoInput = Boolean(
      options.productData?.pageTitle || options.productData?.metaDescription
    );

    const preOrderInput = {
      productId,
      localeContext: {
        channelId,
        locale,
      },
      data: {
        message: options.productData?.preOrderMessage,
      },
    };
    const hasPreOrderInput = Boolean(options.productData?.preOrderMessage);

    const storefrontInput = {
      productId,
      localeContext: {
        channelId,
        locale,
      },
      data: {
        warranty: options.productData?.warranty,
        availabilityDescription: options.productData?.availabilityDescription,
        searchKeywords: options.productData?.searchKeywords,
      },
    };
    const hasStorefrontInput = Boolean(
      options.productData?.warranty ||
        options.productData?.availabilityDescription ||
        options.productData?.searchKeywords
    );

    const optionsInput = {
      productId,
      localeContext: {
        channelId,
        locale,
      },
      data: { options: options.productData?.options || [] },
    };
    const hasOptionsInput = Boolean(options.productData?.options?.length);

    const modifiersInput = {
      productId,
      localeContext: {
        channelId,
        locale,
      },
      data: { modifiers: options.productData?.modifiers || [] },
    };
    const hasModifiersInput = Boolean(options.productData?.modifiers?.length);

    const customFieldsInput = {
      productId,
      data: options.productData?.customFields || [],
    };
    const hasCustomFieldsInput = Boolean(
      options.productData?.customFields?.length
    );

    const variables = {
      productId: formatProductId(options.productId),
      channelId: formatChannelId(options.channelId),
      locale: options.locale,
      basicInput,
      hasBasicInput,
      seoInput,
      hasSeoInput,
      preOrderInput,
      hasPreOrderInput,
      storefrontInput,
      hasStorefrontInput,
      optionsInput,
      hasOptionsInput,
      modifiersInput,
      hasModifiersInput,
      customFieldsInput,
      hasCustomFieldsInput,
    };

    const response = await this.request({
      query: print(UpdateProductLocaleDataDocument),
      variables,
    });
    const typedResponse = response as unknown as {
      data: { store: { product: ProductType } };
    };

    if (!typedResponse.data?.store?.product) {
      throw new Error("Product not found");
    }
    return typedResponse.data.store.product;
  }

  async getAllProducts(limit: number, cursor?: string) {
    type Response = ResultOf<typeof GetAllProductsDocument>;
    type ProductsType = NonNullable<Response["store"]>["products"];

    const variables = createGetAllProductsVariables({ limit, cursor });
    const response = await this.request(
      { query: print(GetAllProductsDocument) },
      variables
    );
    const typedResponse = response as unknown as {
      data: { site: { products: ProductsType } };
    };

    if (!typedResponse.data?.site?.products) {
      return {
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [],
      };
    }
    return typedResponse.data.site.products;
  }

  // Category Translation Methods
  async getCategoryTranslations(params: {
    channelId: number;
    locale: string;
    first?: number;
    after?: string | null;
  }) {
    type Response = ResultOf<typeof GetCategoryTranslationsDocument>;
    type TranslationsType = NonNullable<Response["store"]>["translations"];

    const variables = createGetCategoryTranslationsVariables(params);

    const response = await this.request<Response>(
      { query: print(GetCategoryTranslationsDocument) },
      variables
    );

    if (!response.data?.store?.translations) {
      throw new Error("Failed to get category translations");
    }

    return response.data.store.translations;
  }

  async updateCategoryTranslations(params: {
    channelId: number;
    locale: string;
    categories: Array<{
      categoryId: number;
      fields: Array<{
        fieldName: string;
        value: string;
      }>;
    }>;
  }) {
    type Response = ResultOf<typeof UpdateCategoryTranslationsDocument>;

    const variables = createUpdateCategoryTranslationsVariables(params);

    const response = await this.request<Response>(
      { query: print(UpdateCategoryTranslationsDocument) },
      variables
    );

    if (response.data?.translation?.updateTranslations?.errors?.length) {
      const errors = response.data.translation.updateTranslations.errors;
      throw new Error(
        `Failed to update category translations: ${errors
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    return response.data;
  }

  async deleteCategoryTranslations(params: {
    channelId: number;
    locale: string;
    categories: Array<{
      categoryId: number;
      fields: string[];
    }>;
  }) {
    type Response = ResultOf<typeof DeleteCategoryTranslationsDocument>;

    const variables = createDeleteCategoryTranslationsVariables(params);

    const response = await this.request<Response>(
      { query: print(DeleteCategoryTranslationsDocument) },
      variables
    );

    if (response.data?.translation?.deleteTranslations?.errors?.length) {
      const errors = response.data.translation.deleteTranslations.errors;
      throw new Error(
        `Failed to delete category translations: ${errors
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    return response.data;
  }

  // Shared Product Modifiers Methods
  async getSharedProductModifiers(params: {
    channelId: number;
    locale: string;
    first?: number;
    after?: string | null;
    ids?: string[];
  }) {
    type Response = ResultOf<typeof GetSharedProductModifiersDocument>;
    type ModifiersType = NonNullable<
      Response["store"]
    >["sharedProductModifiers"];

    const variables = createGetSharedProductModifiersVariables(params);

    const response = await this.request<Response>(
      { query: print(GetSharedProductModifiersDocument) },
      variables
    );

    if (!response.data?.store?.sharedProductModifiers) {
      throw new Error("Failed to get shared product modifiers");
    }

    return response.data.store.sharedProductModifiers;
  }

  async setSharedProductModifiersInformation(params: {
    channelId: number;
    locale: string;
    modifiers: Array<{
      modifierId: string;
      type: string;
      data: any;
    }>;
  }) {
    type Response = ResultOf<
      typeof SetSharedProductModifiersInformationDocument
    >;

    const variables = createSetSharedProductModifiersVariables(params);

    const response = await this.request<Response>(
      { query: print(SetSharedProductModifiersInformationDocument) },
      variables
    );

    if (
      !response.data?.sharedProductModifiers
        ?.setSharedProductModifiersInformation
    ) {
      throw new Error("Failed to set shared product modifiers information");
    }

    return response.data.sharedProductModifiers
      .setSharedProductModifiersInformation;
  }

  // Shared Product Options Methods
  async getSharedProductOptions(params: {
    channelId: number;
    locale: string;
    first?: number;
    after?: string | null;
    ids?: string[];
  }) {
    type Response = ResultOf<typeof GetSharedProductOptionsDocument>;
    type OptionsType = NonNullable<
      Response["store"]
    >["sharedProductOptions"];

    const variables = createGetSharedProductOptionsVariables(params);

    const response = await this.request<Response>(
      { query: print(GetSharedProductOptionsDocument) },
      variables
    );

    if (!response.data?.store?.sharedProductOptions) {
      throw new Error("Failed to get shared product options");
    }

    return response.data.store.sharedProductOptions;
  }

  async setSharedProductOptionsInformation(params: {
    channelId: number;
    locale: string;
    options: Array<{
      optionId: string;
      type: string;
      data: any;
    }>;
  }) {
    type Response = ResultOf<
      typeof SetSharedProductOptionsInformationDocument
    >;

    const variables = createSetSharedProductOptionsVariables(params);

    const response = await this.request<Response>(
      { query: print(SetSharedProductOptionsInformationDocument) },
      variables
    );

    if (
      !response.data?.sharedProductOptions
        ?.setSharedProductOptionsInformation
    ) {
      throw new Error("Failed to set shared product options information");
    }

    return response.data.sharedProductOptions
      .setSharedProductOptionsInformation;
  }
}
