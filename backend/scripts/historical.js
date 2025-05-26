import Prisma from "@prisma/client";
import fetch from "node-fetch";

const API_KEY_BIRD = "";
const baseUrl = "https://public-api.birdeye.so"; // Base URL for the API

const prisma = new Prisma.PrismaClient();

class PriceAnalyzer {
  constructor() {
    this.apiKey = API_KEY_BIRD; // API key for the data provider
    this.baseUrl = "https://public-api.birdeye.so"; // Base URL for the API
  }

  async callBird(address, chain = "solana", offset = 0, limit = 50) {
    try {
      const response = await fetch(
        `${this.baseUrl}/defi/txs/token?address=${address}&limit=${limit}&offset=${offset}`,
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

  async findOffsetFromBirdeye(firstTxnTime, address, chain) {
    let low = 0;
    let high = 1000; // Start with an initial upper limit
    let foundOffset = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);

      try {
        const result = await this.retryWithBackoff(
          () => this.callBird(address, chain, mid),
          3,
          1000
        );

        if (
          !result.data ||
          !result.data.items ||
          result.data.items.length === 0
        ) {
          console.log(`No data returned for offset: ${mid}`);
          high = mid - 1;
          continue;
        }

        const firstBlockTime = result.data.items[0].blockUnixTime;
        const lastBlockTime =
          result.data.items[result.data.items.length - 1].blockUnixTime;

        console.log(
          `Offset: ${mid}, First Block Time: ${firstBlockTime}, Last Block Time: ${lastBlockTime}`
        );

        // if the first block time is in the future
        if (Number(firstBlockTime) > Number(firstTxnTime)) {
          console.log("go up");
          high = high * 2;
          continue;
        }

        if (firstBlockTime <= firstTxnTime && firstTxnTime <= lastBlockTime) {
          foundOffset = mid;
          break;
        } else if (firstTxnTime < firstBlockTime) {
          // firstTxnTime is earlier than the earliest transaction in the current data set
          high = mid - 1;
        } else {
          // firstTxnTime is later than the latest transaction in the current data set
          low = mid + 1;
        }
      } catch (error) {
        console.error(`API error encountered for offset ${mid}:`, error);
        high = Math.floor(high * 0.75); // to round number down        continue
        continue;
      }

      if (low > high && foundOffset === -1) {
        console.log(
          `Expanding search range. Current high: ${high}, low: ${low}`
        );
        high = high <= 0 ? 1000 : high * 2;
        low = high / 2;
      }
    }

    if (foundOffset === -1) {
      throw new Error("Could not find the correct offset");
    }

    return foundOffset;
  }

  // STEP 1:  get the earliest txn for each token_to_track in the database
  // STEP 2:  hit birdeye api within rate limit to get all txns before that and insert into DB

  async getEarliestTxns() {
    console.log("Fetching earliest txns...");
    const start = Date.now();

    const tokens = ["3psH1Mj1f7yUfaD5gh6Zj7epE8hhrMkMETgv5TshQA4o"];
    const t = await prisma.tokens_to_track.findMany({
      where: {
        address: tokens[0],
      },
      orderBy: {
        order: "asc",
      },
    });

    for (const token of t) {
      const firstTxn = await prisma.txns.findFirst({
        where: {
          OR: [
            { to_address: token.address, side: "buy" },
            { from_address: token.address, side: "sell" },
          ],
        },
        orderBy: {
          block_unix_time: "asc",
        },
      });

      const firstTxnTime = firstTxn.block_unix_time;
      console.log(firstTxnTime);

      const result = await this.findOffsetFromBirdeye(
        firstTxnTime,
        token.address,
        token.chain
      );

      console.log(result, "found offset?");

      //   concurrently grab all txns before that time from birdeye api without overwhelming RPM 1000 limit
      //   find the new earliest txn time and repeat until we have all the txns

      // save to a json file for testing purposes
      //
    }

    const elapsedTimeInSeconds = (Date.now() - start) / 1000;
    console.log(`Elapsed time: ${elapsedTimeInSeconds} seconds`);
    return "done";
  }

  async fixTxnGap() {
    const tokens = await prisma.tokens_to_track.findMany({
      take: 1,
      skip: 0,
      orderBy: { order: "asc" },
      where: {
        chain: "solana",
      },
    });

    const txnDataGapStart = 1717866222;
    const txnDataGapEnd = 1718143447;
    const HOUR_RANGE = 0.1 * 60 * 60; // Adjusted to smaller intervals

    const findCorrectOffset = async (tokens) => {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        let currentStart = txnDataGapStart;

        console.log(
          `Starting processing for token: ${token.address} on chain: ${token.chain}`
        );

        while (currentStart < txnDataGapEnd) {
          const currentEnd = Math.min(currentStart + HOUR_RANGE, txnDataGapEnd);
          let txnsToUpload = [];
          let offset = 0;
          let step = 50; // Initial step size for exponential search
          let calls = 0;

          console.log(
            `Processing time range: ${currentStart} to ${currentEnd}`
          );

          // Initial exploratory phase to find the upper bound
          while (true) {
            calls++;
            console.log(
              `Exploration phase - Call number ${calls}, offset ${offset}`
            );
            const result = await this.retryWithBackoff(
              () => this.callBird(token.address, token.chain, offset),
              3,
              1000
            );

            const transactions = result.data.items;
            console.log(`Fetched ${transactions.length} transactions`);

            if (transactions.length === 0) {
              console.log("No more transactions available");
              break; // No more transactions available
            }

            const lastTxnTimestamp =
              transactions[transactions.length - 1].blockUnixTime;
            console.log(`Last transaction timestamp: ${lastTxnTimestamp}`);

            if (lastTxnTimestamp < currentStart) {
              console.log("Found upper bound for offset");
              break; // Found the upper bound
            }

            offset += step;
            step *= 2; // Exponential increase
          }

          let low = Math.max(0, offset - step / 2);
          let high = offset;

          console.log(
            `Starting binary search between offsets ${low} and ${high}`
          );

          // Binary search for the correct offset
          while (low <= high) {
            let mid = Math.floor((low + high) / 2);
            console.log(`Binary search - Checking mid offset ${mid}`);

            const result = await this.retryWithBackoff(
              () => this.callBird(token.address, token.chain, mid),
              3,
              1000
            );

            const transactions = result.data.items;
            console.log(
              `Fetched ${transactions.length} transactions at mid offset ${mid}`
            );

            if (transactions.length === 0) {
              console.log("No transactions found at this offset");
              high = mid - 1; // No transactions found, adjust high
              continue;
            }

            const firstTxnTimestamp = transactions[0].blockUnixTime;
            const lastTxnTimestamp =
              transactions[transactions.length - 1].blockUnixTime;

            console.log(`First transaction timestamp: ${firstTxnTimestamp}`);
            console.log(`Last transaction timestamp: ${lastTxnTimestamp}`);

            if (firstTxnTimestamp < currentStart) {
              console.log("First transaction is before the start of the gap");
              low = mid + 1; // We need a later offset
            } else {
              console.log("Last transaction is after the start of the gap");
              high = mid - 1; // We need an earlier offset
            }
          }

          // Extend the offset to ensure no transactions are missed
          console.log(`Extending range starting from offset ${low}`);
          let mid = low;
          while (true) {
            const result = await this.retryWithBackoff(
              () => this.callBird(token.address, token.chain, mid),
              3,
              1000
            );

            const transactions = result.data.items;
            if (transactions.length === 0) {
              console.log("No more transactions available");
              break; // No more transactions available
            }

            calls++;
            console.log(`More calls ${calls}, offset ${mid}`);

            let allInRange = true;
            for (let txn of transactions) {
              const txnTimestamp = txn.blockUnixTime;
              if (txnTimestamp >= currentStart && txnTimestamp <= currentEnd) {
                txnsToUpload.push(txn);
              } else if (txnTimestamp < currentStart) {
                allInRange = false;
                break;
              }
            }

            if (!allInRange) {
              break;
            }

            // Increase the offset to fetch the next batch
            mid += transactions.length;
          }

          console.log(`Found ${txnsToUpload.length} transactions to upload`);

          // Filter transactions to include only those within the range
          const initialTxnsCount = txnsToUpload.length;
          txnsToUpload = txnsToUpload.filter(
            (txn) =>
              txn.blockUnixTime >= currentStart &&
              txn.blockUnixTime <= currentEnd
          );
          const afterFilterCount = txnsToUpload.length;

          console.log(
            `Removed ${
              initialTxnsCount - afterFilterCount
            } transactions outside the range`
          );

          // Remove duplicates
          const uniqueTxns = Array.from(
            new Set(txnsToUpload.map((txn) => txn.txHash))
          ).map((txHash) => txnsToUpload.find((txn) => txn.txHash === txHash));

          console.log(
            `Removed ${
              afterFilterCount - uniqueTxns.length
            } duplicate transactions`
          );

          // Convert to Prisma model format with null checks
          const prismaTxns = uniqueTxns
            .map((txn) => {
              const formattedTxn = {
                tx_hash: txn.txHash,
                owner_address: txn.owner,
                block_unix_time: txn.blockUnixTime,
                to_address: txn.to?.address,
                from_address: txn.from?.address,
                side: txn.side,
                price: txn.pricePair,
                units: txn.to?.uiAmount,
              };

              // Check for missing fields and log them
              const missingFields = Object.entries(formattedTxn).filter(
                ([key, value]) => value == null
              );
              if (missingFields.length > 0) {
                console.log(
                  `Transaction with txHash ${
                    txn.txHash
                  } is missing fields: ${missingFields
                    .map(([key]) => key)
                    .join(", ")}`
                );
                return null; // Exclude this transaction
              }

              return formattedTxn;
            })
            .filter((txn) => txn !== null); // Exclude null entries

          console.log(
            `First transaction in range: ${
              prismaTxns[0]?.block_unix_time || "None"
            }`,
            `Last transaction in range: ${
              prismaTxns[prismaTxns.length - 1]?.block_unix_time || "None"
            }`,
            `Transactions to upload for token ${token.address}: ${prismaTxns.length}`
          );

          // Move to the next time interval
          currentStart = currentEnd;
        }
      }
    };

    await findCorrectOffset(tokens);
  }

  // Main method to execute the price analysis
  async main() {
    // Example usage:
    try {
      await this.fixTxnGap();
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
