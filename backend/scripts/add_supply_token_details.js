import Prisma from "@prisma/client";
import fetch from "node-fetch";

const API_KEY_BIRD = "";
const baseUrl = "https://public-api.birdeye.so"; // Base URL for the API

const prisma = new Prisma.PrismaClient();

class TokenDetails {
  constructor() {
    this.apiKey = API_KEY_BIRD; // API key for the data provider
    this.baseUrl = "https://public-api.birdeye.so"; // Base URL for the API
  }

  async callBird(address, chain = "solana", offset = 0, limit = 50) {
    try {
      const response = await fetch(
        `${this.baseUrl}/defi/token_overview?address=${address}`,
        {
          method: "GET",
          headers: {
            "x-chain": chain,
            "X-API-KEY": this.apiKey,
          },
        }
      );
      //   if (!response.ok) throw new Error(`Network response was not ok: ${response}`);
      const json = await response.json();

      return json;
    } catch (error) {
      console.error("Error:", error);
    }
  }

  async retryWithBackoff(fn, maxRetries, delay) {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (error) {
        console.log(
          JSON.stringify({
            event: "RetryFail",
            attempt: attempt + 1,
            error: error,
            delay,
          })
        );
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

  async addTokens() {
    const tokens = await prisma.tokens_to_track.findMany({
      skip: 855, // this many already in there, need this in token select
      orderBy: { order: "asc" },
      where: {
        chain: "solana",
      },
    });
    const block_unix_time_last_update = Math.floor(Date.now() / 1000); // Current Unix timestamp in seconds

    // loop through tokens
    for (let i = 0; i < tokens.length; i++) {
      const { address } = tokens[i];
      try {
        const details = await this.retryWithBackoff(
          () => this.callBird(address),
          3,
          1000
        );

        console.log(i, details.data.supply * details.data.price, "s * p");
        console.log(
          i,
          details.data.circulatingSupply * details.data.price,
          "cs * p"
        );
        console.log(i, details.data.mc, "mc");

        await prisma.token_details.create({
          data: {
            address,
            supply: details.data.supply,
            block_unix_time_last_update,
          },
        });
      } catch (error) {
        console.log(error);
      }
    }

    //   retruwithbackoff to callbird
  }
  // Main method to execute the price analysis
  async main() {
    // Example usage:
    try {
      await this.addTokens();
      // await this.getEarliestTxns();
    } catch (error) {
      console.error("Main processing error:", error);
    } finally {
      await prisma.$disconnect();
      console.log("Database connection closed.");
    }
  }
}

async function main() {
  const tokenDetails = new TokenDetails();
  await tokenDetails.main();

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
