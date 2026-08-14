CREATE TYPE "showcase_type" AS ENUM ('none', 'top', 'featured');
--> statement-breakpoint
ALTER TABLE "companies"
  ADD COLUMN "showcase_type" "showcase_type" DEFAULT 'none' NOT NULL,
  ADD COLUMN "showcase_rank" integer DEFAULT 0 NOT NULL;
