CREATE TABLE "content" (
	"id" text PRIMARY KEY,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl" bigint,
	CONSTRAINT "uq_content_imdb" UNIQUE("imdb_id","type"),
	CONSTRAINT "uq_content_tmdb" UNIQUE("tmdb_id","type"),
	CONSTRAINT "uq_content_tvdb" UNIQUE("tvdb_id","type")
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY,
	"status" text NOT NULL,
	"type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kv" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL,
	"size" integer,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mkvdrama" (
	"id" text PRIMARY KEY,
	"provider_content_id" text NOT NULL,
	"ouo_id" text UNIQUE,
	"quality" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl" bigint
);
--> statement-breakpoint
CREATE TABLE "ouo" (
	"id" text PRIMARY KEY,
	"original_url" text NOT NULL,
	"redirected_url" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_content" (
	"id" text PRIMARY KEY,
	"content_id" text,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"year" integer NOT NULL,
	"type" text NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl" bigint
);
--> statement-breakpoint
CREATE TABLE "stream" (
	"id" text PRIMARY KEY,
	"provider_content_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"season" text NOT NULL,
	"episode" text NOT NULL,
	"url" text NOT NULL CONSTRAINT "uq_stream_url" UNIQUE,
	"playlist" text,
	"hash" text CONSTRAINT "uq_stream_hash" UNIQUE,
	"resolution" text,
	"size" text,
	"duration" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl" bigint
);
--> statement-breakpoint
CREATE TABLE "subtitle" (
	"id" text PRIMARY KEY,
	"provider_content_id" text NOT NULL,
	"season" text,
	"episode" text,
	"url" text NOT NULL CONSTRAINT "uq_subtitles_url" UNIQUE,
	"lang" text NOT NULL,
	"subtitle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl" bigint,
	CONSTRAINT "uq_subtitles_provider_season_episode_lang" UNIQUE("provider_content_id","season","episode","lang")
);
--> statement-breakpoint
CREATE INDEX "idx_kv_expires_at" ON "kv" ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_provider_content_external_id" ON "provider_content" ("provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_stream_provider_id" ON "stream" ("provider_content_id");--> statement-breakpoint
CREATE INDEX "idx_subtitle_provider_id" ON "subtitle" ("provider_content_id");--> statement-breakpoint
ALTER TABLE "mkvdrama" ADD CONSTRAINT "mkvdrama_provider_content_id_provider_content_id_fkey" FOREIGN KEY ("provider_content_id") REFERENCES "provider_content"("id");--> statement-breakpoint
ALTER TABLE "mkvdrama" ADD CONSTRAINT "mkvdrama_ouo_id_ouo_id_fkey" FOREIGN KEY ("ouo_id") REFERENCES "ouo"("id");--> statement-breakpoint
ALTER TABLE "provider_content" ADD CONSTRAINT "provider_content_content_id_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content"("id");--> statement-breakpoint
ALTER TABLE "stream" ADD CONSTRAINT "stream_provider_content_id_provider_content_id_fkey" FOREIGN KEY ("provider_content_id") REFERENCES "provider_content"("id");--> statement-breakpoint
ALTER TABLE "subtitle" ADD CONSTRAINT "subtitle_provider_content_id_provider_content_id_fkey" FOREIGN KEY ("provider_content_id") REFERENCES "provider_content"("id");