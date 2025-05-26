-- AlterTable
ALTER TABLE "segments" ALTER COLUMN "new_trader_tokens_bought_48h" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "new_trader_tokens_sold_48h" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "reccuring_trader_tokens_bought_48h" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "reccuring_trader_tokens_sold_48h" SET DATA TYPE DOUBLE PRECISION;
