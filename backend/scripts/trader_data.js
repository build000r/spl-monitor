import Prisma from "@prisma/client";
import fetch from "node-fetch";

const API_KEY_BIRD = env("API_KEY_BIRD");
const prisma = new Prisma.PrismaClient();

class PriceAnalyzer {
  constructor() {
    this.apiKey = API_KEY_BIRD; // API key for the data provider
    this.baseUrl = "https://public-api.birdeye.so"; // Base URL for the API
  }

  async getUniqueTraders() {
    console.log("Fetching unique traders...");
    const start = Date.now();
    const result = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT address) AS unique_traders
      FROM (
        SELECT to_address AS address FROM txns
        UNION ALL
        SELECT from_address AS address FROM txns
      ) AS addresses
    `;

    const elapsedTimeInSeconds = (Date.now() - start) / 1000;

    console.log(`Unique traders: ${result[0].unique_traders}`);
    console.log(`Elapsed time: ${elapsedTimeInSeconds} seconds`);
    return result[0].unique_traders;
  }

  async getFirstTxns() {
    console.log("Fetching first transactions...");
    const start = Date.now();
    const result = await prisma.txns.findFirst({
      where: {
        side: "sell",
      },
    });
    console.log(result);

    const txns = await prisma.txns.findMany({
      where: {
        owner_address: result.owner_address,
      },
    });

    const elapsedTimeInSeconds = (Date.now() - start) / 1000;

    console.log(`First transactions: ${(txns.length, txns[0])}`);
    console.log(txns[txns.length - 1]);
    console.log(txns.length);
    console.log(`Elapsed time: ${elapsedTimeInSeconds} seconds`);
    return result;
  }

  // Main method to execute the price analysis
  async main() {
    // Example usage:
    try {
      await this.getFirstTxns();
    } catch (error) {
      console.error("Main processing error:", error);
    } finally {
      await prisma.$disconnect();
      console.log("Database connection closed.");
    }
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
