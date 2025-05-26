-- AlterTable
ALTER TABLE "segments" ADD COLUMN     "token_buy_volume" DOUBLE PRECISION,
ADD COLUMN     "token_sell_volume" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "trader_segment_class" (
    "id" SERIAL NOT NULL,
    "owner_address" TEXT NOT NULL,
    "token_balance" INTEGER NOT NULL,
    "token_address" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "bull" BOOLEAN NOT NULL,
    "trader_type" TEXT NOT NULL,
    "segment_id" INTEGER NOT NULL,
    "trader_asset_summary_id" INTEGER NOT NULL,

    CONSTRAINT "trader_segment_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trader_asset_summary" (
    "id" SERIAL NOT NULL,
    "owner_address" TEXT NOT NULL,
    "asset_address" TEXT NOT NULL,
    "update_method" TEXT NOT NULL,
    "first_txn_unix" INTEGER,
    "asset_holdings_token" DOUBLE PRECISION,
    "asset_holdings_usd" DOUBLE PRECISION,
    "total_wallet_value_usd" DOUBLE PRECISION,
    "sol_token" DOUBLE PRECISION,
    "sol_usd_value" DOUBLE PRECISION NOT NULL,
    "updated_at" INTEGER NOT NULL,

    CONSTRAINT "trader_asset_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trader_segment_class_owner_address_idx" ON "trader_segment_class"("owner_address");

-- CreateIndex
CREATE INDEX "trader_segment_class_segment_id_idx" ON "trader_segment_class"("segment_id");

-- CreateIndex
CREATE INDEX "trader_segment_class_token_address_idx" ON "trader_segment_class"("token_address");

-- CreateIndex
CREATE INDEX "trader_asset_summary_owner_address_asset_address_idx" ON "trader_asset_summary"("owner_address", "asset_address");

-- CreateIndex
CREATE INDEX "trader_asset_summary_owner_address_idx" ON "trader_asset_summary"("owner_address");

-- CreateIndex
CREATE INDEX "trader_asset_summary_asset_address_idx" ON "trader_asset_summary"("asset_address");

-- CreateIndex
CREATE INDEX "trader_asset_summary_first_txn_unix_idx" ON "trader_asset_summary"("first_txn_unix");

-- CreateIndex
CREATE INDEX "trader_asset_summary_updated_at_idx" ON "trader_asset_summary"("updated_at");

-- CreateIndex
CREATE INDEX "trader_asset_summary_update_method_idx" ON "trader_asset_summary"("update_method");

-- AddForeignKey
ALTER TABLE "trader_segment_class" ADD CONSTRAINT "trader_segment_class_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trader_segment_class" ADD CONSTRAINT "trader_segment_class_trader_asset_summary_id_fkey" FOREIGN KEY ("trader_asset_summary_id") REFERENCES "trader_asset_summary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
