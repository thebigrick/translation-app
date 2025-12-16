import debug from 'debug';
import { RestClientConfig, RequestOptions, StoreInformationResponse } from './types';
import { EmailTemplate, EmailTemplateUpdateData } from './types/email-templates';

export class BigCommerceRestClient {
  private config: RestClientConfig;
  private baseUrl: string;
  private apiUrl: string;
  private headers: Record<string, string>;
  private maxRetries: number;
  private logger: debug.Debugger;

  constructor(config: RestClientConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl || "https://api.bigcommerce.com";
    this.maxRetries = config.maxRetries || 3;
    this.logger = debug('bigcommerce:rest');

    this.baseUrl = this.config.storeHash
      ? `${this.apiUrl}/stores/${this.config.storeHash}`
      : this.apiUrl;

    this.headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Encoding": "*",
      ...config.headers,
    };

    if (config.accessToken) {
      this.headers["X-Auth-Token"] = config.accessToken;
    }

    this.logger('Initialized BigCommerce REST client:', {
      apiUrl: this.apiUrl,
      storeHash: this.config.storeHash,
      hasAccessToken: !!config.accessToken
    });
  }

  static createClient(config: RestClientConfig): BigCommerceRestClient {
    return new BigCommerceRestClient(config);
  }

  private async handleRateLimit(response: Response, retryCount: number = 0): Promise<any> {
    const retryAfterHeader = response.headers.get('X-Rate-Limit-Time-Reset-Ms');
    const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 30000;

    if (retryCount >= this.maxRetries) {
      const error = new Error(`Rate limit reached. Max retries (${this.maxRetries}) exceeded.`);
      this.logger('Rate limit reached, max retries exceeded:', error);
      throw error;
    }

    // Log remaining quota information
    const quota = response.headers.get("X-Rate-Limit-Requests-Quota");
    const remaining = response.headers.get("X-Rate-Limit-Requests-Left");
    const timeWindow = response.headers.get("X-Rate-Limit-Time-Window-Ms");

    this.logger('REST Rate Limits:', {
      quota,
      remaining,
      timeWindow,
      retryAfterMs
    });

    console.warn(
      `Rate limit reached. Retrying after ${Math.ceil(retryAfterMs / 1000)} seconds. ` +
      `Attempt ${retryCount + 1}/${this.maxRetries}`
    );
    
    await new Promise(resolve => setTimeout(resolve, retryAfterMs));
    return this.request(this.lastRequestPath, {
      ...this.lastRequestOptions,
      retryCount: retryCount + 1
    });
  }

  private lastRequestPath: string = "";
  private lastRequestOptions: RequestOptions = {};

  private async request<T = any>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;
    this.lastRequestPath = endpoint;
    this.lastRequestOptions = options;

    const requestOptions = {
      method: options.method || "GET",
      headers: { ...this.headers, ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    };

    this.logger('Making request:', {
      url,
      method: requestOptions.method,
      headers: Object.keys(requestOptions.headers),
      hasBody: !!requestOptions.body
    });

    const response = await fetch(url, requestOptions);

    this.logger('Received response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (response.status === 429) {
      return this.handleRateLimit(response, options.retryCount || 0);
    }

    if (!response.ok) {
      let error: any;
      try {
        error = await response.json();
      } catch {
        const text = await response.text().catch(() => "Unknown error");
        error = { message: text };
      }
      
      this.logger('Request failed:', {
        status: response.status,
        error,
        url,
      });
      
      const errorWithStatus = new Error(error.message || `HTTP error! status: ${response.status}`);
      (errorWithStatus as any).status = response.status;
      (errorWithStatus as any).response = error;
      throw errorWithStatus;
    }

    const data = await response.json();
    this.logger('Request successful:', {
      endpoint,
      dataKeys: Object.keys(data)
    });
    return data as T;
  }

  public async get<T = any>(endpoint: string, query = {}): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  public async post<T = any>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data,
    });
  }

  public async put<T = any>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data,
    });
  }

  public async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: "DELETE",
    });
  }

  // GraphQL request method
  public async graphqlRequest<T = any>(
    query: string,
    variables: Record<string, any> = {}
  ): Promise<T> {
    const endpoint = `/graphql`;
    const response = await this.request<{data?: T; errors?: any[]}>(endpoint, {
      method: "POST",
      body: { query, variables },
    });

    if (response.errors && response.errors.length > 0) {
      throw new Error(response.errors[0].message);
    }

    if (!response.data) {
      throw new Error('No data returned from GraphQL request');
    }

    return response.data;
  }

  // REST API Helper Methods

  // Channels
  async getAvailableChannels() {
    return this.request<{data: any[]}>(`/v3/channels?available=true`, { method: "GET" });
  }

  async getChannel(channelId: number) {
    return this.request<{data: any}>(`/v3/channels/${channelId}`, { method: "GET" });
  }

  async getChannelProductAssignments(
    channelId: number,
    limit?: number,
    page?: number
  ) {
    const queryParams = new URLSearchParams();
    queryParams.append(`channel_id:in`, channelId.toString());
    
    if (limit !== undefined) {
      queryParams.append('limit', limit.toString());
    }
    if (page !== undefined) {
      queryParams.append('page', page.toString());
    }
    
    return this.request<{data: any[]; meta?: {pagination?: any}}>(
      `/v3/catalog/products/channel-assignments?${queryParams.toString()}`,
      {
        method: "GET",
      }
    );
  }

  async getChannelLocales(channelId: number) {
    return this.request<{data: any[]}>(`/v3/settings/store/locales?channel_id=${channelId}`, {
      method: "GET",
    });
  }

  // Store Information
  async getStoreInformation() {
    return this.request<StoreInformationResponse>(`/v2/store.json`, { method: "GET" });
  }

  // Email Templates
  async getEmailTemplates(channelId?: number) {
    const query = channelId ? `?channel_id=${channelId}` : '';
    return this.request<{data: EmailTemplate[]}>(`/v3/marketing/email-templates${query}`, { method: "GET" });
  }

  async getEmailTemplate(templateName: string, channelId?: number) {
    const query = channelId ? `?channel_id=${channelId}` : '';
    return this.request<{data: EmailTemplate}>(`/v3/marketing/email-templates/${templateName}${query}`, { method: "GET" });
  }

  async updateEmailTemplate(templateName: string, data: EmailTemplateUpdateData, channelId?: number) {
    const query = channelId ? `?channel_id=${channelId}` : '';
    return this.request<{data: EmailTemplate}>(`/v3/marketing/email-templates/${templateName}${query}`, {
      method: "PUT",
      body: data,
    });
  }

  async deleteEmailTemplateOverride(templateName: string, channelId: number) {
    return this.request(`/v3/marketing/email-templates/${templateName}?channel_id=${channelId}`, {
      method: "DELETE",
    });
  }
} 