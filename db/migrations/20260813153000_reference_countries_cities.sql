CREATE TABLE IF NOT EXISTS "countries" (
  "code" varchar(2) PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" varchar(50) DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cities" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "country_code" varchar(2) NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
  CONSTRAINT "cities_country_code_countries_code_fk"
    FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code")
    ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cities_country_code_name_unique"
  ON "cities" ("country_code", "name");
--> statement-breakpoint
INSERT INTO "countries" ("code", "name")
VALUES
  ('UA', 'Ukraine'),
  ('PL', 'Poland'),
  ('DE', 'Germany'),
  ('US', 'United States'),
  ('GB', 'United Kingdom'),
  ('CZ', 'Czech Republic'),
  ('FR', 'France'),
  ('IT', 'Italy'),
  ('ES', 'Spain'),
  ('PT', 'Portugal')
ON CONFLICT ("code") DO NOTHING;
