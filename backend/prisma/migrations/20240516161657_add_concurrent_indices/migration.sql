-- CreateIndex 
CREATE INDEX "txns_block_unix_time_idx" ON "txns"("block_unix_time");

-- CreateIndex
CREATE INDEX "idx_to_address_side" ON "txns"("to_address", "side");

-- CreateIndex
CREATE INDEX "idx_from_address_side" ON "txns"("from_address", "side");

-- CreateIndex
CREATE INDEX "txns_smoothed_price_idx" ON "txns"("smoothed_price");