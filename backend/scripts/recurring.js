import Prisma from "@prisma/client";
import { Mutex } from "async-mutex";

const API_KEY_BIRD = "";

const prisma = new Prisma.PrismaClient();
const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY_MS = 1000;

class ReccuringTraders {
  constructor() {
    this.apiKey = API_KEY_BIRD; // API key for the data provider
    this.baseUrl = "https://public-api.birdeye.so"; // Base URL for the API
    this.mutex = new Mutex(); // Initialize a new Mutex
    this.activeBuffer = [];
    this.batchSize = 250; /// Adjust this to the desired batch size
    this.tradersAdded = 0;
    this.lastUpdated = 1716323452;
  }

  async retryWithBackoff(fn, maxRetries, delay) {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (error) {
        attempt++;
        if (attempt === maxRetries) {
          console.log(
            JSON.stringify({
              event: "RetryMaxFail",
              error: error,
            })
          );
          break;
        }

        // Wait for the retry delay, increasing exponentially
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  async flushBuffer(batch) {
    if (batch.length === 0) return;

    const x = await this.retryWithBackoff(
      () => {
        return prisma.trader_asset_summary.createMany({
          data: batch,
          skipDuplicates: true, // Optionally skip duplicates
        });
      },
      MAX_RETRIES,
      INITIAL_RETRY_DELAY_MS
    );

    this.tradersAdded += batch.length;
    console.log(x, " flushed ", " total: ", this.tradersAdded);
  }

  async processData(data) {
    if (
      !Object.values(data).every(
        (value) => value !== null && value !== undefined
      )
    ) {
      console.log("Skipping, missing data: ", data);
      return;
    }

    const release = await this.mutex.acquire();
    let batch = [];

    try {
      if (this.activeBuffer.length >= this.batchSize - 1) {
        batch = [...this.activeBuffer, data];
        this.activeBuffer.length = 0;
      } else {
        this.activeBuffer.push(data);
      }
    } finally {
      release();
    }

    if (batch.length > 0) {
      await this.flushBuffer(batch);
    }
  }

  async fillByUniqueTrader() {
    // get all unique traders from txns
    const traders = await prisma.$queryRaw`
        select distinct owner_address
        from txns
        where owner_address NOT LIKE '0x%'
        AND block_unix_time > ${this.lastUpdated};
    `;

    console.log("unique traders in period", traders.length);
    for (let i = 0; i < traders.length; i += 1) {
      if (i % 5000 === 0) {
        console.log("Processing trader ", i, " of ", traders.length);
      }
      const updated_at = Math.floor(Date.now() / 1000);

      const { owner_address } = traders[i];

      // for next recurring run

      const uniqueAssetsByOwner = await this.retryWithBackoff(
        () => prisma.$queryRaw`
            SELECT unique_assets.asset_address, MIN(unique_assets.block_unix_time) AS first_txn_unix
            FROM (
            SELECT from_address AS asset_address, block_unix_time
            FROM txns
            WHERE side = 'sell' AND owner_address = ${owner_address}
            UNION
            SELECT to_address AS asset_address, block_unix_time
            FROM txns
            WHERE side = 'buy' AND owner_address = ${owner_address}
            ) AS unique_assets
            LEFT JOIN trader_asset_summary tas
            ON unique_assets.asset_address = tas.asset_address
            AND tas.owner_address = ${owner_address}
            WHERE tas.asset_address IS NULL
            GROUP BY unique_assets.asset_address;

      `,
        MAX_RETRIES,
        INITIAL_RETRY_DELAY_MS
      );

      //   console.log(
      //     owner_address,
      //     uniqueAssetsByOwner.length,
      //     "new unique assets by owner",
      //     i,
      //     " of ",
      //     traders.length
      //   );

      await uniqueAssetsByOwner.map(
        async (a) =>
          await this.processData({
            ...a,
            owner_address,
            updated_at,
            sol_usd_value: 0,
            update_method: "db",
          })
      );
    }

    await this.flushBuffer(this.activeBuffer);
    this.activeBuffer.length = 0;

    console.log("done");
  }

  async main() {
    try {
      const timestamp = Math.floor(new Date().getTime() / 1000);
      await this.fillByUniqueTrader();
      this.tradersAdded = 0;
      this.lastUpdated = timestamp;
      console.log("next run looking at txns > ", this.lastUpdated);
    } catch (error) {
      console.error("Main processing error:", error);
    } finally {
      await prisma.$disconnect();
      console.log("Database connection closed.");
    }
  }
}

async function main() {
  const recc = new ReccuringTraders();

  await recc.main();
  setInterval(async () => {
    await recc.main();
  }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

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
