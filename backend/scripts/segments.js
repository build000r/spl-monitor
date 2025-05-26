import Prisma from "@prisma/client";
import fetch from "node-fetch";
import pLimit from "p-limit";
import { exec } from "child_process";

const API_KEY_BIRD = "";
const prisma = new Prisma.PrismaClient();
const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY_MS = 1000;

class PriceAnalyzer {
  constructor() {
    this.apiKey = API_KEY_BIRD; // API key for the data provider
    this.baseUrl = "https://public-api.birdeye.so"; // Base URL for the API
    this.usedSmooth = 0;
    this.noSmooth = 0;
    this.period = "6H-A";
    // this.period = "TEST"; // MOOST COMMENT IN FOR TESET
  }

  // Method to fetch price data from the API
  async fetchPrice(time, address, range = 60, type = "1m") {
    const before = time - range;
    const after = time + range;
    const url = `${this.baseUrl}/defi/history_price?address=${address}&address_type=token&time_from=${before}&time_to=${after}&type=${type}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-chain": "solana",
          "X-API-KEY": this.apiKey,
        },
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(
          `API Error: ${response.status} ${JSON.stringify(json)}`
        );
      }
      if (json.data && json.data.items.length) {
        return json.data.items[0];
      } else {
        console.log(
          "No price found, extending range",
          range * 1.2,
          address,
          time
        );
        return await this.fetchPrice(time, address, range * 1.2, type); // Recursive call with extended range
      }
    } catch (error) {
      console.error("Fetch Price Error:", error);
      throw error; // Rethrow to handle retry logic elsewhere
    }
  }

  // Method to get the price range for a specified period
  async getPriceRangeForPeriod(time_from, time_to, address) {
    try {
      const startPrice = await this.retryWithBackoff(
        () => this.fetchPrice(time_from, address),
        3,
        1000
      );
      const endPrice = await this.retryWithBackoff(
        () => this.fetchPrice(time_to, address),
        3,
        1000
      );
      return { startPrice, endPrice };
    } catch (error) {
      console.error("Error getting price range:", error);
      return null;
    }
  }

  // Method to perform operations with retries and exponential backoff
  async retryWithBackoff(fn, maxRetries, delay) {
    let attempts = 0;
    while (attempts < maxRetries) {
      try {
        return await fn();
      } catch (error) {
        attempts++;
        console.log(`Attempt ${attempts}: Retrying after ${delay} ms...`);
        if (attempts === maxRetries) {
          console.error("Max retries reached, giving up.", error);
          throw new Error("Max retries reached.");
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  async checkMissingAddresses(address, transactions) {
    // get unique owner_addresses from transactions
    const ownerAddresses = transactions.map(
      (transaction) => transaction.owner_address
    );
    const uniqueOwnerAddresses = [...new Set(ownerAddresses)];

    // ADD RETRYWITHBACKOFFHERE

    const result = await this.retryWithBackoff(
      () => prisma.$queryRaw`
            SELECT DISTINCT owner_address
            FROM txns
            WHERE owner_address = ANY(${uniqueOwnerAddresses})
            AND NOT EXISTS (
                SELECT 1
                FROM trader_asset_summary
                WHERE trader_asset_summary.owner_address = txns.owner_address
                AND trader_asset_summary.asset_address = ${address}
            )
        `,
      MAX_RETRIES,
      INITIAL_RETRY_DELAY_MS
    );

    return result.map((r) => r.owner_address);
    //   const { owner_address } = result[i];
    //   const firstBuy = await this.retryWithBackoff(
    //     () => prisma.$queryRaw`
    //           SELECT asset_address, MIN(block_unix_time) AS first_txn_unix
    //           FROM (
    //               SELECT from_address AS asset_address, block_unix_time
    //               FROM txns
    //               WHERE side = 'sell'
    //                 AND owner_address = ${owner_address}
    //                 AND from_address = ${address}
    //               UNION
    //               SELECT to_address AS asset_address, block_unix_time
    //               FROM txns
    //               WHERE side = 'buy'
    //                 AND owner_address = ${owner_address}
    //                 AND to_address = ${address}
    //           ) AS unique_assets
    //           GROUP BY asset_address;
    //       `,
    //     MAX_RETRIES,
    //     INITIAL_RETRY_DELAY_MS
    //   );

    //   console.log(firstBuy);
    //   const updated_at = Math.floor(Date.now() / 1000);

    //   const data = firstBuy.map((a) => {
    //     return {
    //       ...a,
    //       owner_address,
    //       updated_at,
    //       sol_usd_value: 0,
    //       update_method: "db",
    //     };
    //   });

    //   const fillTraderHistory = await this.retryWithBackoff(
    //     () =>
    //       prisma.trader_asset_summary.createMany({
    //         data,
    //         skipDuplicates: true,
    //       }),
    //     MAX_RETRIES,
    //     INITIAL_RETRY_DELAY_MS
    //   );

    //   console.log(data, fillTraderHistory, "first buy data");
    // }

    // return missingAddresses;
  }

  async calcData(address, transactions, startTime, endTime) {
    // these two things can be done at the same time
    const { startPrice, endPrice } = await this.getPriceRangeForPeriod(
      startTime,
      endTime,
      address
    );

    const addressVolumes = transactions.reduce((acc, txn) => {
      const volume = txn.units * (txn.smoothed_price || txn.price);

      if (!txn.smoothed_price) {
        this.noSmooth++;
      } else {
        this.usedSmooth++;
      }

      acc[txn.owner_address] = acc[txn.owner_address] || {
        buy: 0,
        sell: 0,
        net: 0, // Initialize net volume
      };

      if (txn.side === "buy") {
        acc[txn.owner_address].buy += volume;
      } else {
        acc[txn.owner_address].sell += volume;
      }

      // Calculate net volume as buy minus sell
      acc[txn.owner_address].net =
        acc[txn.owner_address].buy - acc[txn.owner_address].sell;

      return acc;
    }, {});

    const categories = {
      whale: { count: 0, bulls: 0, bears: 0 },
      dolphin: { count: 0, bulls: 0, bears: 0 },
      fish: { count: 0, bulls: 0, bears: 0 },
      shrimp: { count: 0, bulls: 0, bears: 0 },
    };
    const categoryVolumes = {
      whale: { buyVolume: 0, sellVolume: 0 },
      dolphin: { buyVolume: 0, sellVolume: 0 },
      fish: { buyVolume: 0, sellVolume: 0 },
      shrimp: { buyVolume: 0, sellVolume: 0 },
    };
    const categoryPercentages = {};

    Object.values(addressVolumes).forEach((volumes) => {
      let categoryKey;

      // Use absolute value for category thresholds
      if (Math.abs(volumes.net) >= 10000) {
        categoryKey = "whale";
      } else if (Math.abs(volumes.net) >= 1000) {
        categoryKey = "dolphin";
      } else if (Math.abs(volumes.net) >= 100) {
        categoryKey = "fish";
      } else {
        categoryKey = "shrimp";
      }

      categories[categoryKey].count++;

      // Determine sentiment using the sign of netVolume
      if (volumes.net >= 0) {
        categories[categoryKey].bulls++;
      } else {
        categories[categoryKey].bears++;
      }

      categoryVolumes[categoryKey].buyVolume += volumes.buy;
      categoryVolumes[categoryKey].sellVolume += volumes.sell;
    });

    const totalBuyVolume = Object.values(categoryVolumes).reduce(
      (sum, category) => sum + category.buyVolume,
      0
    );
    const totalSellVolume = Object.values(categoryVolumes).reduce(
      (sum, category) => sum + category.sellVolume,
      0
    );
    const totalAddresses = Object.values(addressVolumes).length;

    Object.keys(categoryVolumes).forEach((categoryKey) => {
      const categoryData = categories[categoryKey];
      const categoryVolumeData = categoryVolumes[categoryKey];
      categoryPercentages[categoryKey] = {
        percent: (categoryData.count / totalAddresses) * 100,
        bulls:
          categoryData.count > 0
            ? (categoryData.bulls / categoryData.count) * 100
            : 0,
        bears:
          categoryData.count > 0
            ? (categoryData.bears / categoryData.count) * 100
            : 0,
        buyVolumePercent:
          totalBuyVolume !== 0 &&
          !isNaN(categoryVolumeData.buyVolume / totalBuyVolume)
            ? (categoryVolumeData.buyVolume / totalBuyVolume) * 100
            : 0,
        sellVolumePercent:
          totalSellVolume !== 0 &&
          !isNaN(categoryVolumeData.sellVolume / totalSellVolume)
            ? (categoryVolumeData.sellVolume / totalSellVolume) * 100
            : 0,
      };
    });

    Object.keys(categories).forEach((category) => {
      const categoryData = categories[category];
      categoryPercentages[category] = {
        percent: (categoryData.count / totalAddresses) * 100,
        bulls:
          categoryData.count > 0
            ? (categoryData.bulls / categoryData.count) * 100
            : 0,
        bears:
          categoryData.count > 0
            ? (categoryData.bears / categoryData.count) * 100
            : 0,
      };
    });

    const totalVolumes = transactions.reduce(
      (totals, txn) => {
        const volume = txn.units * (txn.smoothed_price || txn.price);

        if (txn.side === "buy") {
          totals.buy += volume; // Accumulate buy volume
        } else if (txn.side === "sell") {
          totals.sell += volume; // Accumulate sell volume
        }

        return totals;
      },
      { buy: 0, sell: 0 }
    ); // Initial totals for buy and sell

    const consolidatedData = {
      categoryDetails: {},
      totalTransactionVolume: {
        buy: totalBuyVolume,
        sell: totalSellVolume,
      },
      startTime,
      endTime,
      address,
      period: this.period, /// -A is just the initial run through
      startPrice: startPrice.value,
      endPrice: endPrice.value,
      priceChangePercent:
        (endPrice.value - startPrice.value) / startPrice.value,
    };

    Object.keys(categoryVolumes).forEach((categoryKey) => {
      const categoryData = categories[categoryKey];
      const categoryVolumeData = categoryVolumes[categoryKey];

      consolidatedData.categoryDetails[categoryKey] = {
        walletPercent: categoryData.count / totalAddresses,
        bulls:
          categoryData.count > 0 ? categoryData.bulls / categoryData.count : 0,
        bears:
          categoryData.count > 0 ? categoryData.bears / categoryData.count : 0,
        buyVolumePercent: !isNaN(categoryVolumeData.buyVolume / totalBuyVolume)
          ? categoryVolumeData.buyVolume / totalBuyVolume
          : 0,
        sellVolumePercent: !isNaN(
          categoryVolumeData.sellVolume / totalSellVolume
        )
          ? categoryVolumeData.sellVolume / totalSellVolume
          : 0,
      };
    });

    //
    // NEWNEW
    //

    const missing = await this.checkMissingAddresses(address, transactions);

    let traders = await prisma.trader_asset_summary.findMany({
      where: {
        asset_address: address,
      },
    });

    // we only care about the owner_address that transacted within this 6 hour block
    const ownerAddresses = transactions.map(
      (transaction) => transaction.owner_address
    );
    const uniqueOwnerAddresses = [...new Set(ownerAddresses)];

    traders = traders.filter((trader) =>
      uniqueOwnerAddresses.includes(trader.owner_address)
    );

    let firstTraders = [
      ...traders
        .filter(
          (trader) =>
            trader.first_txn_unix >= endTime - 48 * 60 * 60 &&
            trader.first_txn_unix <= endTime
        )
        .map((trader) => trader.owner_address),
      ...missing,
    ];

    const recurringTraders = traders
      .filter(
        (trader) => trader.first_txn_unix <= endTime - 48 * 60 * 60 // end time minus 48 hours
      )
      .map((trader) => trader.owner_address);

    const firstTraderTransactions = transactions.filter((transaction) =>
      firstTraders.includes(transaction.owner_address)
    );

    const recurringTraderTransactions = transactions.filter((transaction) =>
      recurringTraders.includes(transaction.owner_address)
    );

    const firstTraderUnitsBought = firstTraderTransactions
      .filter((t) => t.side == "buy")
      .reduce((total, transaction) => total + transaction.units, 0);

    const firstTraderUnitsSold = firstTraderTransactions
      .filter((t) => t.side == "sell")
      .reduce((total, transaction) => total + transaction.units, 0);

    const recurringTraderUnitsBought = recurringTraderTransactions
      .filter((t) => t.side == "buy")
      .reduce((total, transaction) => total + transaction.units, 0);
    const recurringTraderUnitsSold = recurringTraderTransactions
      .filter((t) => t.side == "sell")
      .reduce((total, transaction) => total + transaction.units, 0);

    const tokenSellVolume = transactions
      .filter((t) => t.side == "sell")
      .reduce((total, transaction) => total + transaction.units, 0);
    const tokenBuyVolume = transactions
      .filter((t) => t.side == "buy")
      .reduce((total, transaction) => total + transaction.units, 0);

    // THEN we want the volume from this

    //   console.log("consol data", JSON.stringify(consolidatedData, null, 2));
    const recc_token_data = {
      new_trader_tokens_bought_48h: firstTraderUnitsBought,
      new_trader_tokens_sold_48h: firstTraderUnitsSold,
      reccuring_trader_tokens_bought_48h: recurringTraderUnitsBought,
      reccuring_trader_tokens_sold_48h: recurringTraderUnitsSold,
      new_traders_48h: firstTraders.length,
      recurring_traders_48h: recurringTraders.length,
      token_buy_volume: tokenBuyVolume,
      token_sell_volume: tokenSellVolume,
    };

    //
    //
    //

    //   console.log("consol data", JSON.stringify(consolidatedData, null, 2));
    const createSegmentData = {
      ...recc_token_data,

      // Relating to the tokens_to_track table by the address field
      token: {
        connect: {
          address: consolidatedData.address,
        },
      },
      // Category Details for Whale
      whale_wallet_percent:
        consolidatedData.categoryDetails.whale.walletPercent,
      whale_bulls: consolidatedData.categoryDetails.whale.bulls,
      whale_bears: consolidatedData.categoryDetails.whale.bears,
      whale_buy_volume_percent:
        consolidatedData.categoryDetails.whale.buyVolumePercent,
      whale_sell_volume_percent:
        consolidatedData.categoryDetails.whale.sellVolumePercent,

      // Category Details for Dolphin
      dolphin_wallet_percent:
        consolidatedData.categoryDetails.dolphin.walletPercent,
      dolphin_bulls: consolidatedData.categoryDetails.dolphin.bulls,
      dolphin_bears: consolidatedData.categoryDetails.dolphin.bears,
      dolphin_buy_volume_percent:
        consolidatedData.categoryDetails.dolphin.buyVolumePercent,
      dolphin_sell_volume_percent:
        consolidatedData.categoryDetails.dolphin.sellVolumePercent,

      // Category Details for Fish
      fish_wallet_percent: consolidatedData.categoryDetails.fish.walletPercent,
      fish_bulls: consolidatedData.categoryDetails.fish.bulls,
      fish_bears: consolidatedData.categoryDetails.fish.bears,
      fish_buy_volume_percent:
        consolidatedData.categoryDetails.fish.buyVolumePercent,
      fish_sell_volume_percent:
        consolidatedData.categoryDetails.fish.sellVolumePercent,

      // Category Details for Shrimp
      shrimp_wallet_percent:
        consolidatedData.categoryDetails.shrimp.walletPercent,
      shrimp_bulls: consolidatedData.categoryDetails.shrimp.bulls,
      shrimp_bears: consolidatedData.categoryDetails.shrimp.bears,
      shrimp_buy_volume_percent:
        consolidatedData.categoryDetails.shrimp.buyVolumePercent,
      shrimp_sell_volume_percent:
        consolidatedData.categoryDetails.shrimp.sellVolumePercent,

      // Overall transaction volume details
      total_buy_volume: consolidatedData.totalTransactionVolume.buy,
      total_sell_volume: consolidatedData.totalTransactionVolume.sell,

      // Time and price details
      start_time: consolidatedData.startTime,
      end_time: consolidatedData.endTime,
      period: consolidatedData.period,
      start_price: consolidatedData.startPrice,
      end_price: consolidatedData.endPrice,
      price_change_percent: consolidatedData.priceChangePercent,
    };

    this.createSegment(createSegmentData);
  }

  async createSegment(createSegmentData) {
    await this.retryWithBackoff(
      () =>
        prisma.segments.create({
          data: createSegmentData,
        }),
      3,
      1000
    );

    //   console.log(
    //     {
    //       startTime: new Date(startTime * 1000),
    //       endTime: new Date(endTime * 1000),
    //       address: createSegmentData.address,
    //       whale_wallet_percent: createSegmentData.whale_wallet_percent,
    //       whale_bulls: createSegmentData.whale_bulls,
    //       whale_bears: createSegmentData.whale_bears,
    //       whale_buy_volume_percent: createSegmentData.whale_buy_volume_percent,
    //       price_change_percent: createSegmentData.price_change_percent,
    //     },
    //     "data input"
    //   );
  }

  getLatestSixHourIntervalUTC() {
    const currentDate = new Date(); // Get current date and time
    // what is the unix timestamp of the current date ?
    currentDate.setUTCMinutes(0, 0, 0); // Set minutes, seconds, and milliseconds to zero

    // Get the current UTC hour and calculate the last interval
    const currentUTCHours = currentDate.getUTCHours();
    const hoursSinceLastInterval = currentUTCHours % 6;
    const lastIntervalHours = currentUTCHours - hoursSinceLastInterval;

    currentDate.setUTCHours(lastIntervalHours); // Update the hour to the last interval
    const endTime = Math.floor(currentDate.getTime() / 1000); // Unix timestamp in seconds for the end time

    // Calculate the start time, which is 6 hours before the end time
    const startTime = endTime - 6 * 60 * 60; // Subtract 21600 seconds (6 hours)

    return {
      startTime: startTime,
      endTime: endTime,
    };
  }

  async processToken(address, interval) {
    const lastUpdate = await prisma.segments.findFirst({
      where: {
        address: address,
        period: this.period,
      },
      orderBy: {
        end_time: "desc",
      },
    });

    // console.log("processing: ", address);

    let stopUnixEndTime = 0;
    // MOOSE comment in
    if (lastUpdate) {
      if (lastUpdate.end_time >= interval.endTime) {
        console.log(
          "already updated past this time",
          address,
          lastUpdate.end_time,
          interval.endTime
        );
        return;
      }

      stopUnixEndTime = lastUpdate.end_time;
    }

    // move down from loop
    let startTime = interval.startTime;
    let endTime = interval.endTime;

    while (true) {
      const transactions = await prisma.txns.findMany({
        where: {
          block_unix_time: {
            gt: startTime,
            lt: endTime,
          },
          OR: [
            {
              AND: [{ to_address: address }, { side: "buy" }],
            },
            {
              AND: [{ from_address: address }, { side: "sell" }],
            },
          ],
        },
      });

      //   console.log(transactions.length, "new txns");
      if (transactions.length === 0) {
        break;
      } else {
        await this.calcData(address, transactions, startTime, endTime);
      }

      endTime = startTime;
      startTime -= 6 * 60 * 60; // Subtract 21600 seconds (6 hours)

      if (startTime < stopUnixEndTime) {
        break;
      }
    }
  }

  // Main method to execute the price analysis
  async main() {
    // exec("pm2 stop historical_segments", (error, stdout, stderr) => {
    //   if (error) {
    //     console.error(`exec error: ${error}`);
    //     return;
    //   } else {
    //     console.log("stop historical_segments");
    //   }
    // });

    const interval = this.getLatestSixHourIntervalUTC();

    const starting = Date.now();

    const limit = pLimit(20); // Limit concurrency to 20

    console.log("running latest interval: ", interval); // Output the object with start and end times as Unix timestamps

    const tokens = await prisma.tokens_to_track.findMany({
      where: {
        chain: "solana",
      },
      orderBy: {
        order: "asc",
      },
      //   take: 2, // MOOSE
    });

    const tasks = tokens.map((token) =>
      limit(() => this.processToken(token.address, interval))
    );

    try {
      await Promise.all(tasks);
      console.log(
        JSON.stringify({
          event: "AllTokensProcessed",
          duration: (Date.now() - starting) / 1000 + "s",
        })
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "ProcessingError",
          error,
        })
      );
    }

    console.log({
      noSmooth: this.noSmooth,
      smooth: this.usedSmooth,
      perc: this.usedSmooth / (this.noSmooth + this.usedSmooth),
    });

    this.noSmooth = 0;
    this.usedSmooth = 0;

    // for batch processing at 6h time frame
    const currentTime = Math.floor(new Date().getTime() / 1000); // current time in seconds
    let timeUntilNextInterval = interval.endTime + 6 * 60 * 60 - currentTime; // time until the next 6-hour interval
    const nextRunTimestamp = currentTime + timeUntilNextInterval;
    console.log("Next run at Unix timestamp:", nextRunTimestamp);

    if (timeUntilNextInterval < 0) {
      console.log(
        "The next interval has already passed. Running again in 1 second."
      );
      timeUntilNextInterval = 1; // Set a small delay to allow the current execution context to complete
    }

    exec("pm2 start add_z", (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      } else {
        console.log(`start add_z`);
        return;
      }
    });

    // exec("pm2 start historical_segments", (error, stdout, stderr) => {
    //   if (error) {
    //     console.error(`exec error: ${error}`);
    //     return;
    //   } else {
    //     console.log(`start historical_segments`);
    //     return;
    //   }
    // });

    setTimeout(() => this.main(), timeUntilNextInterval * 1000);
  }
}

async function main() {
  const priceAnalyzer = new PriceAnalyzer();
  await priceAnalyzer.main();

  async function shutdown() {
    try {
      await prisma.$disconnect();
      console.log("Disconnected from the database successfully.");
    } catch (error) {
      console.error("Failed to disconnect from the database:", error);
    } finally {
      process.exit(0); // Ensure the process exits after attempts to clean up
    }
  }

  process.on("SIGINT", async () => {
    console.log("SIGINT received, shutting down gracefully.");
    await shutdown();
    return;
  });

  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down gracefully.");
    await shutdown();
  });
}

main()
  .catch((e) => {
    console.error(`An unhandled exception occurred: ${e.message}`);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
