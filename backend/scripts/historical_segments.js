import Prisma from "@prisma/client";
import fetch from "node-fetch";
import pLimit from "p-limit";
import { exec } from "child_process";

const API_KEY_BIRD = "";
const prisma = new Prisma.PrismaClient();
const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY_MS = 1000;
// remove break from while
// un comment .create
// remove take
// clean console.logs
//  change period from test

class PriceAnalyzer {
  constructor() {
    this.apiKey = API_KEY_BIRD; // API key for the data provider
    this.baseUrl = "https://public-api.birdeye.so"; // Base URL for the API
    this.usedSmooth = 0;
    this.noSmooth = 0;
    this.period = "6H-A";
  }

  // Method to perform operations with retries and exponential backoff
  async retryWithBackoff(fn, maxRetries, delay) {
    let attempts = 0;
    while (attempts < maxRetries) {
      try {
        return await fn();
      } catch (error) {
        attempts++;
        // console.log(`Attempt ${attempts}: Retrying after ${delay} ms...`);
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

  async calcData(address, startTime, endTime, id) {
    console.log("id", id);
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
    const updateSegmentData = {
      new_trader_tokens_bought_48h: firstTraderUnitsBought,
      new_trader_tokens_sold_48h: firstTraderUnitsSold,
      reccuring_trader_tokens_bought_48h: recurringTraderUnitsBought,
      reccuring_trader_tokens_sold_48h: recurringTraderUnitsSold,
      new_traders_48h: firstTraders.length,
      recurring_traders_48h: recurringTraders.length,
      token_buy_volume: tokenBuyVolume,
      token_sell_volume: tokenSellVolume,
    };

    // console.log(updateSegmentData, "update segment data", address, id);

    await this.updateSegment(updateSegmentData, id);
  }

  async updateSegment(updateSegmentData, id) {
    const update = await this.retryWithBackoff(
      () =>
        prisma.segments.update({
          where: {
            id: id,
          },
          data: updateSegmentData,
        }),
      3,
      1000
    );

    console.log(update.id, "updated");
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

  // Main method to execute the price analysis
  async main() {
    const segments = await prisma.segments.findMany({
      where: {
        token_buy_volume: null,
      },
      orderBy: {
        id: "asc",
      },
    });

    console.log(segments.length, "segments length to go");

    const limit = pLimit(10); // limit concurrency to 20
    const tasks = segments.map(({ address, start_time, end_time, id }) => {
      return limit(() => this.calcData(address, start_time, end_time, id));
    });
    await Promise.all(tasks);
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
