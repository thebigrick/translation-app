import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('userid').notNull(),
  email: text('email').notNull(),
  username: text('username')
}, (table) => {
  return {
    userIdIdx: uniqueIndex('userid_idx').on(table.userId),
  }
});

export const stores = sqliteTable('stores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeHash: text('storehash').notNull(),
  accessToken: text('accesstoken'),
  scope: text('scope'),
  ownerId: integer('ownerid').notNull(),
  accountUuid: text('accountuuid').notNull()
}, (table) => {
  return {
    storeHashIdx: uniqueIndex('storehash_idx').on(table.storeHash),
  }
});

export const storeUsers = sqliteTable('storeusers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('userid').notNull(),
  storeHash: text('storehash').notNull()
}, (table) => {
  return {
    userStoreIdx: uniqueIndex('userid_storeHash_idx').on(table.userId, table.storeHash),
  }
});

export const translationJobs = sqliteTable('translation_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeHash: text('store_hash').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default('pending'),
  jobType: text('job_type', { enum: ['import', 'export'] }).notNull(),
  resourceType: text('resource_type', { enum: ['products', 'categories', 'shared-modifiers', 'shared-options', 'brands', 'email-templates'] }).notNull().default('products'),
  fileUrl: text('file_url'),
  channelId: integer('channel_id').notNull(),
  locale: text('locale').notNull(),
  metadata: text('metadata'), // SQLite doesn't have JSON type, store as stringified JSON
  error: text('error'),
  createdAt: integer('created_at').notNull(), // SQLite uses INTEGER for timestamps
  updatedAt: integer('updated_at').notNull(),
});

export const translationErrors = sqliteTable('translation_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull(), // References translationJobs.id
  entityId: integer('entity_id').notNull(), // Generic ID for products, categories, etc.
  lineNumber: integer('line_number').notNull(),
  errorType: text('error_type').notNull(), // SQLite does not support enum types
  errorMessage: text('error_message').notNull(),
  rawData: text('raw_data'), // Store JSON as string
  createdAt: integer('created_at').notNull() // SQLite uses INTEGER for timestamps
});

export type TranslationJob = typeof translationJobs.$inferSelect;
export type NewTranslationJob = typeof translationJobs.$inferInsert;
export type TranslationError = typeof translationErrors.$inferSelect;