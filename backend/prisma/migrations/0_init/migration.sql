-- CreateTable
CREATE TABLE "tokens_to_track" (
    "address" TEXT NOT NULL,
    "symbol" TEXT,
    "chain" TEXT NOT NULL,
    "order" SERIAL NOT NULL,

    CONSTRAINT "tokens_to_track_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "segments" (
    "id" SERIAL NOT NULL,
    "whale_wallet_percent" DOUBLE PRECISION NOT NULL,
    "whale_bulls" DOUBLE PRECISION NOT NULL,
    "whale_bears" DOUBLE PRECISION NOT NULL,
    "whale_buy_volume_percent" DOUBLE PRECISION NOT NULL,
    "whale_sell_volume_percent" DOUBLE PRECISION NOT NULL,
    "dolphin_wallet_percent" DOUBLE PRECISION NOT NULL,
    "dolphin_bulls" DOUBLE PRECISION NOT NULL,
    "dolphin_bears" DOUBLE PRECISION NOT NULL,
    "dolphin_buy_volume_percent" DOUBLE PRECISION NOT NULL,
    "dolphin_sell_volume_percent" DOUBLE PRECISION NOT NULL,
    "fish_wallet_percent" DOUBLE PRECISION NOT NULL,
    "fish_bulls" DOUBLE PRECISION NOT NULL,
    "fish_bears" DOUBLE PRECISION NOT NULL,
    "fish_buy_volume_percent" DOUBLE PRECISION NOT NULL,
    "fish_sell_volume_percent" DOUBLE PRECISION NOT NULL,
    "shrimp_wallet_percent" DOUBLE PRECISION NOT NULL,
    "shrimp_bulls" DOUBLE PRECISION NOT NULL,
    "shrimp_bears" DOUBLE PRECISION NOT NULL,
    "shrimp_buy_volume_percent" DOUBLE PRECISION NOT NULL,
    "shrimp_sell_volume_percent" DOUBLE PRECISION NOT NULL,
    "total_buy_volume" DOUBLE PRECISION NOT NULL,
    "total_sell_volume" DOUBLE PRECISION NOT NULL,
    "start_time" INTEGER NOT NULL,
    "end_time" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "start_price" DOUBLE PRECISION NOT NULL,
    "end_price" DOUBLE PRECISION NOT NULL,
    "price_change_percent" DOUBLE PRECISION NOT NULL,
    "whale_bulls_percent_mean" DOUBLE PRECISION,
    "whale_bulls_std_dev" DOUBLE PRECISION,
    "whale_z_address" DOUBLE PRECISION,
    "whale_bulls_percent_mean_all_token_same_period" DOUBLE PRECISION,
    "whale_bulls_std_dev_all_token_same_period" DOUBLE PRECISION,
    "whale_z_period" DOUBLE PRECISION,
    "whale_wallet_net_mean" DOUBLE PRECISION,
    "whale_wallet_net_std_dev" DOUBLE PRECISION,
    "whale_wallet_net_z" DOUBLE PRECISION,
    "whale_wallet_net_mean_all_token" DOUBLE PRECISION,
    "whale_wallet_net_std_dev_all_token" DOUBLE PRECISION,
    "whale_wallet_net_z_all_token" DOUBLE PRECISION,
    "holders" DOUBLE PRECISION,
    "mc" DOUBLE PRECISION,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "txns" (
    "tx_hash" TEXT NOT NULL,
    "owner_address" TEXT NOT NULL,
    "block_unix_time" INTEGER NOT NULL,
    "to_address" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "units" DOUBLE PRECISION NOT NULL,
    "smoothed_price" DOUBLE PRECISION,

    CONSTRAINT "txns_pkey" PRIMARY KEY ("side","tx_hash")
);

-- CreateTable
CREATE TABLE "token_details" (
    "address" TEXT NOT NULL,
    "block_unix_time_last_update" INTEGER NOT NULL,
    "decimals" INTEGER,
    "symbol" TEXT,
    "logoURI" TEXT,
    "liquidity" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "history30mPrice" DOUBLE PRECISION,
    "priceChange30mPercent" DOUBLE PRECISION,
    "history1hPrice" DOUBLE PRECISION,
    "priceChange1hPercent" DOUBLE PRECISION,
    "history2hPrice" DOUBLE PRECISION,
    "priceChange2hPercent" DOUBLE PRECISION,
    "history4hPrice" DOUBLE PRECISION,
    "priceChange4hPercent" DOUBLE PRECISION,
    "history6hPrice" DOUBLE PRECISION,
    "priceChange6hPercent" DOUBLE PRECISION,
    "history8hPrice" DOUBLE PRECISION,
    "priceChange8hPercent" DOUBLE PRECISION,
    "history12hPrice" DOUBLE PRECISION,
    "priceChange12hPercent" DOUBLE PRECISION,
    "history24hPrice" DOUBLE PRECISION,
    "priceChange24hPercent" DOUBLE PRECISION,
    "uniqueWallet30m" INTEGER,
    "uniqueWalletHistory30m" INTEGER,
    "uniqueWallet30mChangePercent" DOUBLE PRECISION,
    "uniqueWallet1h" INTEGER,
    "uniqueWalletHistory1h" INTEGER,
    "uniqueWallet1hChangePercent" DOUBLE PRECISION,
    "uniqueWallet2h" INTEGER,
    "uniqueWalletHistory2h" INTEGER,
    "uniqueWallet2hChangePercent" DOUBLE PRECISION,
    "uniqueWallet4h" INTEGER,
    "uniqueWalletHistory4h" INTEGER,
    "uniqueWallet4hChangePercent" DOUBLE PRECISION,
    "uniqueWallet6h" INTEGER,
    "uniqueWalletHistory6h" INTEGER,
    "uniqueWallet6hChangePercent" DOUBLE PRECISION,
    "uniqueWallet8h" INTEGER,
    "uniqueWalletHistory8h" INTEGER,
    "uniqueWallet8hChangePercent" DOUBLE PRECISION,
    "uniqueWallet12h" INTEGER,
    "uniqueWalletHistory12h" INTEGER,
    "uniqueWallet12hChangePercent" DOUBLE PRECISION,
    "uniqueWallet24h" INTEGER,
    "uniqueWalletHistory24h" INTEGER,
    "uniqueWallet24hChangePercent" DOUBLE PRECISION,
    "lastTradeUnixTime" INTEGER,
    "lastTradeHumanTime" TEXT,
    "supply" DOUBLE PRECISION,
    "mc" DOUBLE PRECISION,
    "trade30m" INTEGER,
    "tradeHistory30m" INTEGER,
    "trade30mChangePercent" DOUBLE PRECISION,
    "sell30m" INTEGER,
    "sellHistory30m" INTEGER,
    "sell30mChangePercent" DOUBLE PRECISION,
    "buy30m" INTEGER,
    "buyHistory30m" INTEGER,
    "buy30mChangePercent" DOUBLE PRECISION,
    "v30m" DOUBLE PRECISION,
    "v30mUSD" DOUBLE PRECISION,
    "vHistory30m" DOUBLE PRECISION,
    "vHistory30mUSD" DOUBLE PRECISION,
    "v30mChangePercent" DOUBLE PRECISION,
    "vBuy30m" DOUBLE PRECISION,
    "vBuy30mUSD" DOUBLE PRECISION,
    "vBuyHistory30m" DOUBLE PRECISION,
    "vBuyHistory30mUSD" DOUBLE PRECISION,
    "vBuy30mChangePercent" DOUBLE PRECISION,
    "vSell30m" DOUBLE PRECISION,
    "vSell30mUSD" DOUBLE PRECISION,
    "vSellHistory30m" DOUBLE PRECISION,
    "vSellHistory30mUSD" DOUBLE PRECISION,
    "vSell30mChangePercent" DOUBLE PRECISION,
    "trade1h" INTEGER,
    "numberMarkets" INTEGER,
    "coingeckoId" TEXT,
    "serumV3Usdc" TEXT,
    "serumV3Usdt" TEXT,
    "website" TEXT,
    "telegram" TEXT,
    "twitter" TEXT,
    "description" TEXT,
    "discord" TEXT,
    "medium" TEXT,

    CONSTRAINT "token_details_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" SERIAL NOT NULL,
    "token_address" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "created_at" TEXT,
    "block_unix_timestamp" INTEGER,
    "current_price" DOUBLE PRECISION NOT NULL,
    "predicted_price" DOUBLE PRECISION NOT NULL,
    "target_hit" BOOLEAN NOT NULL,
    "target_hit_time" TEXT NOT NULL,
    "trailing_30_predicted_price" DOUBLE PRECISION,
    "trailing_30_direction" DOUBLE PRECISION,
    "direction" DOUBLE PRECISION,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_to_track_order_key" ON "tokens_to_track"("order");

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_address_fkey" FOREIGN KEY ("address") REFERENCES "tokens_to_track"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_details" ADD CONSTRAINT "token_details_address_fkey" FOREIGN KEY ("address") REFERENCES "tokens_to_track"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_token_address_fkey" FOREIGN KEY ("token_address") REFERENCES "tokens_to_track"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

