-- CreateTable
CREATE TABLE "indicators" (
    "id" SERIAL NOT NULL,
    "token_address" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "created_at" INTEGER NOT NULL,
    "block_unix_timestamp" INTEGER NOT NULL,
    "price_at_prediction" DOUBLE PRECISION NOT NULL,
    "max_price_after_percentage" DOUBLE PRECISION,
    "min_price_after_percentage" DOUBLE PRECISION,

    CONSTRAINT "indicators_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "indicators" ADD CONSTRAINT "indicators_token_address_fkey" FOREIGN KEY ("token_address") REFERENCES "tokens_to_track"("address") ON DELETE RESTRICT ON UPDATE CASCADE;
