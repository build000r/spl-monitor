-- AlterTable
ALTER TABLE "segments" ADD COLUMN     "new_trader_tokens_bought_48h" INTEGER,
ADD COLUMN     "new_trader_tokens_sold_48h" INTEGER,
ADD COLUMN     "reccuring_trader_tokens_bought_48h" INTEGER,
ADD COLUMN     "reccuring_trader_tokens_sold_48h" INTEGER;
