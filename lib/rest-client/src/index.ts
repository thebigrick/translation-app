import { BigCommerceRestClient } from './client';
export * from './client';
export * from './types';
export * from './types/email-templates';

export function createRestClient(config: {
  accessToken?: string;
  storeHash?: string;
  apiUrl?: string;
  loginUrl?: string;
  maxRetries?: number;
  headers?: Record<string, string>;
}) {
  return new BigCommerceRestClient(config);
} 