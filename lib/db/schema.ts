import { doublePrecision, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Slush Filmmaker projects — isolated from freya_* / frames tables on shared Neon. */
export const sfProjects = pgTable('sf_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Anonymous browser id (localStorage). Soft ownership — no auth yet. */
  clientKey: text('client_key').notNull(),
  title: text('title').notNull().default('Untitled founder film'),
  template: text('template').notNull().default('founder'),
  website: text('website').notNull().default(''),
  brief: jsonb('brief').$type<Record<string, unknown> | null>(),
  scenes: jsonb('scenes').$type<unknown[]>().notNull().default([]),
  tracks: jsonb('tracks').$type<unknown[]>().notNull().default([]),
  playhead: doublePrecision('playhead').notNull().default(0),
  pendingProposal: jsonb('pending_proposal').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Assets “building blocks” — still + label (+ scene defaults). */
export const sfBlocks = pgTable('sf_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Stable slug e.g. scene-1 — matches Studio Scene.id defaults. */
  key: text('key').notNull().unique(),
  image: text('image').notNull(),
  description: text('description').notNull(),
  caption: text('caption').notNull().default(''),
  duration: doublePrecision('duration').notNull().default(6),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Editable LLM prompts — keyed slug, body may use {{placeholders}}. */
export const sfPrompts = pgTable('sf_prompts', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SfProject = typeof sfProjects.$inferSelect;
export type NewSfProject = typeof sfProjects.$inferInsert;
export type SfBlock = typeof sfBlocks.$inferSelect;
export type NewSfBlock = typeof sfBlocks.$inferInsert;
export type SfPrompt = typeof sfPrompts.$inferSelect;
export type NewSfPrompt = typeof sfPrompts.$inferInsert;
