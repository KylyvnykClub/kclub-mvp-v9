CREATE TYPE "public"."member_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "business_categories" (
	"id" integer PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"block" varchar(255) NOT NULL,
	"category" varchar(255) NOT NULL,
	"subcategory" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" uuid NOT NULL,
	"business_category_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"legal_name" varchar(255),
	"tax_id" varchar(50),
	"description" text,
	"website" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "role" "member_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_business_category_id_business_categories_id_fk" FOREIGN KEY ("business_category_id") REFERENCES "public"."business_categories"("id") ON DELETE restrict ON UPDATE no action;