import { pgTable, serial, integer, json, timestamp, text, varchar, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  userId: integer('userid').notNull(),
  email: text('email').notNull(),
  username: text('username')
}, (table) => {
  return {
    userIdIdx: uniqueIndex('userid_idx').on(table.userId),
  }
});

export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  storeHash: varchar('storehash', { length: 10 }).notNull(),
  accessToken: text('accesstoken'),
  scope: text('scope'),
  ownerId: integer('ownerid').notNull(),
  accountUuid: text('accountuuid').notNull()
}, (table) => {
  return {
    storeHashIdx: uniqueIndex('storehash_idx').on(table.storeHash),
  }
});

export const storeUsers = pgTable('storeusers', {
  id: serial('id').primaryKey(),
  userId: integer('userid').notNull(),
  storeHash: varchar('storehash', { length: 10 }).notNull()
}, (table) => {
  return {
    userStoreIdx: uniqueIndex('userid_storeHash_idx').on(table.userId, table.storeHash),
  }
});

export const translationJobs = pgTable('translation_jobs', {
  id: serial('id').primaryKey(),
  storeHash: varchar('store_hash', { length: 255 }).notNull(),
  status: varchar('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default('pending'),
  jobType: varchar('job_type', { enum: ['import', 'export'] }).notNull(),
  resourceType: varchar('resource_type', { enum: ['products', 'categories', 'shared-modifiers', 'shared-options'] }).notNull().default('products'),
  fileUrl: varchar('file_url', { length: 1024 }),
  channelId: integer('channel_id').notNull(),
  locale: varchar('locale', { length: 10 }).notNull(),
  metadata: json('metadata'),
  error: text('error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const translationErrors = pgTable('translation_errors', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').notNull(), // References translationJobs.id
  entityId: integer('entity_id').notNull(), // Generic ID for products, categories, etc.
  lineNumber: integer('line_number').notNull(),
  errorType: text('error_type', { 
    enum: ['parse_error', 'validation_error', 'api_error', 'unknown']
  }).notNull(),
  errorMessage: text('error_message').notNull(),
  rawData: json('raw_data'), // Original data that caused the error
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export type TranslationJob = typeof translationJobs.$inferSelect;
export type NewTranslationJob = typeof translationJobs.$inferInsert;
export type TranslationError = typeof translationErrors.$inferSelect; 