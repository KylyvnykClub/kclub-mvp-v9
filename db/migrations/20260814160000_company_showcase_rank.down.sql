ALTER TABLE "companies"
  DROP COLUMN "showcase_type",
  DROP COLUMN "showcase_rank";
--> statement-breakpoint
DROP TYPE "showcase_type";
