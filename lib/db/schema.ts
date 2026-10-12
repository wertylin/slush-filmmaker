import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

/** fal.ai model catalog — Sophie routes generate_scene_image via these rows. */
export const sfFalModels = pgTable('sf_fal_models', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Stable slug e.g. flux-schnell — passed as modelKey from tools. */
  key: text('key').notNull().unique(),
  /** fal.run path e.g. fal-ai/flux/schnell */
  endpoint: text('endpoint').notNull(),
  label: text('label').notNull(),
  kind: text('kind').notNull().default('t2i'),
  enabled: boolean('enabled').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  costTier: text('cost_tier').notNull().default('cheap'),
  bestFor: text('best_for').notNull(),
  avoidFor: text('avoid_for').notNull().default(''),
  /** How /api/fal/generate-image builds the request body. */
  requestProfile: text('request_profile').notNull().default('flux'),
  capabilities: jsonb('capabilities')
    .$type<{
      refs?: boolean;
      maxRefs?: number;
      aspect?: boolean;
      edit?: boolean;
    }>()
    .notNull()
    .default({}),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Assets library — seed stills + generated sources (append-only on generate). */
export const sfBlocks = pgTable('sf_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Stable slug e.g. scene-1 — matches Studio Scene.id defaults. */
  key: text('key').notNull().unique(),
  image: text('image').notNull(),
  description: text('description').notNull(),
  caption: text('caption').notNull().default(''),
  duration: doublePrecision('duration').notNull().default(6),
  sortOrder: integer('sort_order').notNull().default(0),
  /** seed | fal | upload | url */
  source: text('source').notNull().default('seed'),
  /** sf_fal_models.key when source=fal */
  modelKey: text('model_key'),
  prompt: text('prompt'),
  aspect: text('aspect'),
  refUrls: text('ref_urls').array().notNull().default([]),
  falRequestId: text('fal_request_id'),
  clientKey: text('client_key'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
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

/** Studio / landing template cards + Fixed skeleton / Customizable slots. */
export const sfTemplates = pgTable('sf_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull().default('STORY'),
  time: text('time').notNull().default('60–90 SEC'),
  image: text('image').notNull(),
  headline: text('headline').notNull(),
  description: text('description').notNull(),
  locked: boolean('locked').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Default Editor project name on Use template. */
  projectTitle: text('project_title'),
  /** Immutable skeleton: beats, track layout, style. */
  fixed: jsonb('fixed').$type<{
    beats: Array<{ id: string; title: string; duration: number }>;
    tracks: unknown[];
    style?: { aspect?: string; transition?: string };
  }>(),
  /** Founder-fillable defaults: captions + images keyed by scene id. */
  slots: jsonb('slots').$type<{
    captions: Record<string, string>;
    images: Record<string, string>;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SfProject = typeof sfProjects.$inferSelect;
export type NewSfProject = typeof sfProjects.$inferInsert;
export type SfFalModel = typeof sfFalModels.$inferSelect;
export type NewSfFalModel = typeof sfFalModels.$inferInsert;
export type SfBlock = typeof sfBlocks.$inferSelect;
export type NewSfBlock = typeof sfBlocks.$inferInsert;
export type SfPrompt = typeof sfPrompts.$inferSelect;
export type NewSfPrompt = typeof sfPrompts.$inferInsert;
export type SfTemplate = typeof sfTemplates.$inferSelect;
export type NewSfTemplate = typeof sfTemplates.$inferInsert;
