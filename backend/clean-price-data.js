import Prisma from "@prisma/client";
import pLimit from "p-limit";

const prisma = new Prisma.PrismaClient();

class PriceProcessor {
  constructor() {
    this.BATCH_SIZE = 1000;
    this.BUFFER_SIZE = 4;
    this.statusInterval = null;
    this.tokenStatus = new Map(); // To track status of each token
  }
  startStatusUpdates() {
    this.reportStatus(); // Initial immediate status report
    this.statusInterval = setInterval(
      () => this.reportStatus(),
      12 * 60 * 60 * 1000 // every 12 hours
      // 10 * 60 * 1000 // every 10 minutes
    );
  }

  stopStatusUpdates() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  async reportStatus() {
    const countSmoothed = await prisma.txns.count({
      where: { smoothed_price: { not: null } },
    });
    const countUnsmoothed = await prisma.txns.count({
      where: { smoothed_price: null },
    });

    console.log(
      JSON.stringify({
        event: "StatusReport",
        timestamp: new Date().toISOString(),
        countSmoothed,
        countUnsmoothed,
      })
    );
  }

  async retryWithBackoff(fn, maxRetries, delay) {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await fn();
        return;
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

  quickSelectMedian(values) {
    function partition(left, right, pivotIndex) {
      let pivotValue = values[pivotIndex];
      [values[pivotIndex], values[right]] = [values[right], values[pivotIndex]];
      let storeIndex = left;
      for (let i = left; i < right; i++) {
        if (values[i] < pivotValue) {
          [values[i], values[storeIndex]] = [values[storeIndex], values[i]];
          storeIndex++;
        }
      }
      [values[storeIndex], values[right]] = [values[right], values[storeIndex]];
      return storeIndex;
    }

    function quickSelect(left, right, k) {
      if (left === right) return values[left];
      let pivotIndex = left + Math.floor(Math.random() * (right - left + 1));
      pivotIndex = partition(left, right, pivotIndex);
      if (k === pivotIndex) {
        return values[k];
      } else if (k < pivotIndex) {
        return quickSelect(left, pivotIndex - 1, k);
      } else {
        return quickSelect(pivotIndex + 1, right, k);
      }
    }

    return quickSelect(0, values.length - 1, Math.floor(values.length / 2));
  }

  preprocessPrices(prices) {
    let n = prices.length;
    for (let i = 1; i < n - 1; i++) {
      let window = prices.slice(Math.max(0, i - 2), Math.min(n, i + 3));
      let med = this.quickSelectMedian([...window]);
      let lowerThreshold = 0.75 * med;
      let upperThreshold = 1.25 * med;

      if (prices[i] < lowerThreshold || prices[i] > upperThreshold) {
        let adjMedian = this.quickSelectMedian([...window]); // Filtering logic can be integrated here if needed
        // console.log(
        //   `Adjusting price at index ${i} from ${prices[i]} to ${adjMedian}`
        // );
        prices[i] = adjMedian;
      }
    }
    return prices;
  }

  async batchProcessSmoothedPrices(targetAddress) {
    this.tokenStatus.set(targetAddress, "Processing");

    let startTxn = await prisma.txns.findFirst({
      where: {
        smoothed_price: {
          not: null,
        },
        OR: [
          { AND: [{ to_address: targetAddress }, { side: "buy" }] },
          { AND: [{ from_address: targetAddress }, { side: "sell" }] },
        ],
      },
      orderBy: { block_unix_time: "desc" },
      skip: this.BUFFER_SIZE,
    });

    if (!startTxn) {
      console.log(
        "No transactions with non-null smoothed prices. Initializing smoothing..."
      );
      // Attempt to find the first transactions to start the smoothing process
      startTxn = await prisma.txns.findFirst({
        where: {
          OR: [
            { AND: [{ to_address: targetAddress }, { side: "buy" }] },
            { AND: [{ from_address: targetAddress }, { side: "sell" }] },
          ],
        },
        orderBy: { block_unix_time: "asc" },
      });

      if (startTxn) {
        const initialTxns = await prisma.txns.findMany({
          where: {
            block_unix_time: { lte: startTxn.block_unix_time },
            OR: [
              { AND: [{ to_address: targetAddress }, { side: "buy" }] },
              { AND: [{ from_address: targetAddress }, { side: "sell" }] },
            ],
          },
          orderBy: { block_unix_time: "asc" },
          take: this.BUFFER_SIZE * 2,
        });

        let prices = initialTxns.map((txn) => txn.price);
        let smoothedPrices = this.preprocessPrices(prices);

        for (let i = 0; i < initialTxns.length; i++) {
          if (smoothedPrices[i] !== initialTxns[i].price) {
            priceChanges.push({
              index: i,
              price: initialTxns[i].price,
              smoothed_price: smoothedPrices[i],
            });
          }
          await this.retryWithBackoff(
            () =>
              prisma.txns.update({
                where: {
                  side_tx_hash: {
                    side: initialTxns[i].side,
                    tx_hash: initialTxns[i].tx_hash,
                  },
                },
                data: {
                  smoothed_price: smoothedPrices[i] || initialTxns[i].price,
                },
              }),
            3,
            1000
          );
        }
      } else {
        console.log("No transactions found to initialize.");
        return; // Exit if no transactions are found at all
      }
    }

    let lastUnixTime = 0;
    if (startTxn) {
      lastUnixTime = startTxn.block_unix_time;
    }

    while (true) {
      const txns = await prisma.txns.findMany({
        where: {
          block_unix_time: { gte: lastUnixTime },
          smoothed_price: null,
          OR: [
            { AND: [{ to_address: targetAddress }, { side: "buy" }] },
            { AND: [{ from_address: targetAddress }, { side: "sell" }] },
          ],
        },
        orderBy: { block_unix_time: "asc" },
        take: this.BATCH_SIZE + 2 * this.BUFFER_SIZE,
      });

      if (txns.length === 0) {
        console.log(
          JSON.stringify({ event: "NoMoreTransactions", lastUnixTime })
        );

        break;
      }

      let prices = txns.map((txn) => txn.price);
      let smoothedPrices = this.preprocessPrices(prices);

      const updates = smoothedPrices.map((smoothedPrice, index) => {
        if (smoothedPrice !== txns[index].price) {
          console.log({
            smooth: smoothedPrice,
            price: txns[index].price,
            event: "price change",
            address: targetAddress,
          });
        }

        return prisma.txns.update({
          where: {
            side_tx_hash: {
              side: txns[index].side,
              tx_hash: txns[index].tx_hash,
            },
          },
          data: { smoothed_price: smoothedPrice },
        });
      });

      await this.retryWithBackoff(
        () =>
          prisma.$transaction(
            updates.slice(this.BUFFER_SIZE, txns.length - this.BUFFER_SIZE)
          ),
        3,
        1000
      );

      if (txns.length > 10 * this.BUFFER_SIZE) {
        lastUnixTime = txns[txns.length - this.BUFFER_SIZE - 1].block_unix_time;
      } else {
        break;
      }
    }

    this.tokenStatus.set(targetAddress, "Completed");
  }

  async startProcessing() {
    this.startStatusUpdates(); // Start periodic status updates

    const starting = Date.now();
    const limit = pLimit(20); // Limit concurrency to 20
    const tokens_to_track = await prisma.tokens_to_track.findMany({});
    console.log(
      JSON.stringify({
        event: "StartProcessing",
        tokenCount: tokens_to_track.length,
        startTime: new Date(starting),
      })
    );

    const processingTasks = tokens_to_track.map((token) =>
      limit(() => this.trackTokenProcessing(token.address))
    );

    try {
      await Promise.all(processingTasks);
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

    console.log(
      "Final token statuses:",
      Array.from(this.tokenStatus.entries())
    );
  }

  async trackTokenProcessing(targetAddress) {
    // console.log(`Processing started for token: ${targetAddress}`);
    try {
      await this.batchProcessSmoothedPrices(targetAddress);
    } catch (error) {
      console.log(`Error processing token ${targetAddress}: ${error}`);
      this.tokenStatus.set(targetAddress, "Error");
    }
  }
}

async function main() {
  const processor = new PriceProcessor();

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

  while (true) {
    // This loop will make the script run continuously
    await processor.startProcessing();
    // No delay here, immediately start the next processing cycle
    console.log("Completed a full run, immediately starting again...");
  }
}

main()
  .catch((e) => {
    console.error(`An unhandled exception occurred: ${e.message}`);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
