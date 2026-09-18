CREATE TABLE "content" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"alt_title" text,
	"overview" text,
	"year" integer NOT NULL,
	"type" text NOT NULL,
	"imdb_id" text,
	"tmdb_id" text,
	"tvdb_id" text,
	"poster" text,
	"background" text,
	"logo" text,
	"genres" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint,
	"ttl" bigint,
	CONSTRAINT "uq_content_imdb" UNIQUE("imdb_id","type"),
	CONSTRAINT "uq_content_tmdb" UNIQUE("tmdb_id","type"),
	CONSTRAINT "uq_content_tvdb" UNIQUE("tvdb_id","type")
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"size" integer,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mkvdrama" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_content_id" text NOT NULL,
	"ouo_id" text,
	"quality" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint,
	"ttl" bigint,
	CONSTRAINT "mkvdrama_ouo_id_unique" UNIQUE("ouo_id")
);
--> statement-breakpoint
CREATE TABLE "ouo" (
	"id" text PRIMARY KEY NOT NULL,
	"original_url" text NOT NULL,
	"redirected_url" text,
	"password" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_content" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"year" integer NOT NULL,
	"type" text NOT NULL,
	"image" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint,
	"ttl" bigint
);
--> statement-breakpoint
CREATE TABLE "stream" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_content_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"season" text NOT NULL,
	"episode" text NOT NULL,
	"url" text NOT NULL,
	"playlist" text,
	"hash" text,
	"resolution" text,
	"size" text,
	"duration" text,
	"created_at" bigint NOT NULL,
	"ttl" bigint,
	CONSTRAINT "uq_stream_url" UNIQUE("url"),
	CONSTRAINT "uq_stream_hash" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "subtitle" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_content_id" text NOT NULL,
	"season" text,
	"episode" text,
	"url" text NOT NULL,
	"lang" text NOT NULL,
	"subtitle" text,
	"created_at" bigint NOT NULL,
	"ttl" bigint,
	CONSTRAINT "uq_subtitles_url" UNIQUE("url"),
	CONSTRAINT "uq_subtitles_provider_season_episode_lang" UNIQUE("provider_content_id","season","episode","lang")
);
--> statement-breakpoint
ALTER TABLE "mkvdrama" ADD CONSTRAINT "mkvdrama_provider_content_id_provider_content_id_fk" FOREIGN KEY ("provider_content_id") REFERENCES "public"."provider_content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mkvdrama" ADD CONSTRAINT "mkvdrama_ouo_id_ouo_id_fk" FOREIGN KEY ("ouo_id") REFERENCES "public"."ouo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_content" ADD CONSTRAINT "provider_content_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream" ADD CONSTRAINT "stream_provider_content_id_provider_content_id_fk" FOREIGN KEY ("provider_content_id") REFERENCES "public"."provider_content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitle" ADD CONSTRAINT "subtitle_provider_content_id_provider_content_id_fk" FOREIGN KEY ("provider_content_id") REFERENCES "public"."provider_content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_kv_expires_at" ON "kv" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_provider_content_external_id" ON "provider_content" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_stream_provider_id" ON "stream" USING btree ("provider_content_id");--> statement-breakpoint
CREATE INDEX "idx_subtitle_provider_id" ON "subtitle" USING btree ("provider_content_id");