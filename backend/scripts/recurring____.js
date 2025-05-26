import Prisma from "@prisma/client";
import fetch from "node-fetch";
import { Mutex } from "async-mutex";

const API_KEY_BIRD = "";

const prisma = new Prisma.PrismaClient();
const lastRunUnixTime = 0; // looking for unique traders since this last run
const lastMaxOrderBirdeye = 0; // the highest order that we've checked for prev txn in birdeye
const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY_MS = 1500;

class ReccuringTraders {
  constructor() {
    this.apiKey = API_KEY_BIRD; // API key for the data provider
    this.baseUrl = "https://public-api.birdeye.so"; // Base URL for the API
    this.lastRunUnixTime = lastRunUnixTime; // looking for unique traders since this last run
    this.lastMaxOrderBirdeye = lastMaxOrderBirdeye; // the highest order that we've checked for prev txn in birdeye
    this.mutex = new Mutex(); // Initialize a new Mutex
    this.activeBuffer = [];
    this.batchSize = 500; /// Adjust this to the desired batch size
    this.tradersAdded = 0;
  }

  async callBird(
    address,
    chain = "solana",
    offset = 0,
    limit = 50,
    url = "tokenlist"
  ) {
    try {
      let endpoint;
      if (url === "tokenlist") {
        endpoint = `${this.baseUrl}/defi/txs/token?address=${address}&limit=${limit}&offset=${offset}`;
      } else if (url === "security") {
        endpoint = `${this.baseUrl}/defi/token_security?address=${address}`;
      } else if (url === "holdings") {
        endpoint = `${this.baseUrl}/v1/wallet/token_list?wallet=${address}`;
      }

      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "x-chain": chain,
          "X-API-KEY": this.apiKey,
        },
      });
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
        // console.log(
        //   JSON.stringify({
        //     event: "RetryFail",
        //     attempt: attempt + 1,
        //     error: error,
        //     delay,
        //   })
        // );
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

  //   async helius() {
  //     const options = {
  //       headers: {
  //         apiKey: "821503a6-f7d6-4782-bd20-cddae427bce0",
  //       },
  //     };

  //     const address = "GGPiThvLX6K3CEB8uaqpXBX6iZPVtT5EYnUBgQnGGUAJ";
  //     let url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${options.headers.apiKey}`;
  //     // const response = await fetch(
  //     // url
  //     // );
  //     // const x = await response.json();
  //     // console.log(x);

  //     // x.map((txn) => console.log({desc: txn.description, }));

  //     let lastSignature = null;

  //     const fetchAndParseTransactions = async () => {
  //       while (true) {
  //         if (lastSignature) {
  //           url += `&before=${lastSignature}`;
  //         }
  //         const response = await fetch(url);
  //         const transactions = await response.json();

  //         if (transactions && transactions.length > 0) {
  //           // console.log("Fetched transactions: ", transactions);
  //           // console.log(transactions.description, transactions)
  //           transactions.map((txn) => console.log(txn.description));
  //           console.log("time", transactions[transactions.length - 1].timestamp);

  //           lastSignature = transactions[transactions.length - 1].signature;
  //         } else {
  //           console.log("No more transactions available.");
  //           break;
  //         }
  //       }
  //     };
  //     fetchAndParseTransactions();
  //   }

  //   async getTraderTxns() {
  //     console.log("Fetching earliest txns...");
  //     const start = Date.now();

  //     const tokens = ["3psH1Mj1f7yUfaD5gh6Zj7epE8hhrMkMETgv5TshQA4o"];

  //     const t = await prisma.tokens_to_track.findMany({
  //       where: {
  //         address: tokens[0],
  //       },
  //       orderBy: {
  //         order: "asc",
  //       },
  //     });

  //     for (const token of t) {
  //       const txns = await prisma.txns.findMany({});

  //       const firstTxn = await prisma.txns.findFirst({
  //         where: {
  //           OR: [
  //             { to_address: token.address, side: "buy" },
  //             { from_address: token.address, side: "sell" },
  //           ],
  //         },
  //         orderBy: {
  //           block_unix_time: "asc",
  //         },
  //       });

  //       const firstTxnTime = firstTxn.block_unix_time;
  //       console.log(firstTxnTime);

  //       //   const result = await this.findOffsetFromBirdeye(
  //       //     firstTxnTime,
  //       //     token.address,
  //       //     token.chain
  //       //   );

  //       //   console.log(result, "found offset?");

  //       //   concurrently grab all txns before that time from birdeye api without overwhelming RPM 1000 limit
  //       //   find the new earliest txn time and repeat until we have all the txns

  //       // save to a json file for testing purposes
  //       //
  //     }

  //     const elapsedTimeInSeconds = (Date.now() - start) / 1000;
  //     console.log(`Elapsed time: ${elapsedTimeInSeconds} seconds`);
  //     return "done";
  //   }

  //   async findEarliestTransactionsForOwner(ownerAddress) {
  //     const query = `
  //       WITH buy_earliest AS (
  //           SELECT
  //               owner_address,
  //               to_address AS asset,
  //               MIN(block_unix_time) AS earliest_time
  //           FROM
  //               transactions
  //           WHERE
  //               side = 'buy'
  //           GROUP BY
  //               owner_address, to_address
  //       ),
  //       sell_earliest AS (
  //           SELECT
  //               owner_address,
  //               from_address AS asset,
  //               MIN(block_unix_time) AS earliest_time
  //           FROM
  //               transactions
  //           WHERE
  //               side = 'sell'
  //           GROUP BY
  //               owner_address, from_address
  //       )
  //       SELECT
  //           t1.tx_hash,
  //           t1.owner_address,
  //           t1.block_unix_time,
  //           t1.to_address AS asset,
  //           t1.from_address,
  //           t1.side,
  //           t1.price,
  //           t1.units,
  //           t1.smoothed_price
  //       FROM
  //           transactions t1
  //       JOIN
  //           buy_earliest be ON t1.owner_address = be.owner_address AND t1.block_unix_time = be.earliest_time AND t1.to_address = be.asset AND t1.side = 'buy'
  //       UNION ALL
  //       SELECT
  //           t2.tx_hash,
  //           t2.owner_address,
  //           t2.block_unix_time,
  //           t2.from_address AS asset,
  //           t2.to_address,
  //           t2.side,
  //           t2.price,
  //           t2.units,
  //           t2.smoothed_price
  //       FROM
  //           transactions t2
  //       JOIN
  //           sell_earliest se ON t2.owner_address = se.owner_address AND t2.block_unix_time = se.earliest_time AND t2.from_address = se.asset AND t2.side = 'sell'
  //       WHERE
  //           t1.owner_address = $1 OR t2.owner_address = $1
  //       ORDER BY
  //           owner_address, asset, block_unix_time;
  //     `;

  //     const results = await prisma.$queryRaw(query, ownerAddress);
  //     console.log(results);
  //   }

  //   async hm() {
  //     // const tokens_tracking = await prisma.tokens_to_track.findMany({
  //     //   where: {
  //     //     chain: "solana",
  //     //   },
  //     //   orderBy: { order: "asc" },
  //     // });

  //     // const traders = await prisma.txns.findMany({});

  //     console.log("test");
  //     const firstTxns = await prisma.$queryRaw`
  //     WITH buy_earliest AS (
  //         SELECT
  //             owner_address,
  //             to_address AS asset,
  //             MIN(block_unix_time) AS earliest_time
  //         FROM
  //             txns
  //         WHERE
  //             side = 'buy'
  //         GROUP BY
  //             owner_address, to_address
  //     ),
  //     sell_earliest AS (
  //         SELECT
  //             owner_address,
  //             from_address AS asset,
  //             MIN(block_unix_time) AS earliest_time
  //         FROM
  //             txns
  //         WHERE
  //             side = 'sell'
  //         GROUP BY
  //             owner_address, from_address
  //     )
  //     SELECT
  //         t1.tx_hash,
  //         t1.owner_address,
  //         t1.block_unix_time,
  //         t1.to_address AS asset,
  //         t1.from_address,
  //         t1.side,
  //         t1.price,
  //         t1.units,
  //         t1.smoothed_price
  //     FROM
  //         txns t1
  //     JOIN
  //         buy_earliest be ON t1.owner_address = be.owner_address AND t1.block_unix_time = be.earliest_time AND t1.to_address = be.asset AND t1.side = 'buy'
  //     UNION ALL
  //     SELECT
  //         t2.tx_hash,
  //         t2.owner_address,
  //         t2.block_unix_time,
  //         t2.from_address AS asset,
  //         t2.to_address,
  //         t2.side,
  //         t2.price,
  //         t2.units,
  //         t2.smoothed_price
  //     FROM
  //         txns t2
  //     JOIN
  //         sell_earliest se ON t2.owner_address = se.owner_address AND t2.block_unix_time = se.earliest_time AND t2.from_address = se.asset AND t2.side = 'sell'
  //     ORDER BY
  //         owner_address, asset, block_unix_time
  //     limit 10;
  //   `;
  //     console.log(firstTxns, "f");
  //   }

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
    console.log("fetching traders");
    const traders = await prisma.$queryRaw`
        select distinct owner_address
        from txns
        where owner_address NOT LIKE '0x%'

        
        ;
    `;

    // 10 at a time

    // for when excluding trader_Asset_summaries that already exist
    // but of course then need to update token balances in holdings
    /*
SELECT asset_address, MIN(block_unix_time) AS earliest_time
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
ON unique_assets.asset_address = tas.asset_address AND tas.owner_address = ${owner_address}
WHERE tas.id IS NULL
GROUP BY asset_address;

    */
    for (let i = 0; i < traders.length; i += 60) {
      //   const startTime = Date.now();
      const updated_at = Math.floor(Date.now() / 1000);

      console.time(`Processing traders ${i} to ${i + 60}`);

      const promises = traders.slice(i, i + 60).map(async (trader) => {
        const { owner_address } = trader;

        const uniqueAssetsByOwner = await prisma.$queryRaw`
            SELECT asset_address, MIN(block_unix_time) AS first_txn_unix
            FROM (
                SELECT from_address AS asset_address, block_unix_time
                FROM txns
                WHERE side = 'sell' AND owner_address = ${owner_address}
                UNION
                SELECT to_address AS asset_address, block_unix_time
                FROM txns
                WHERE side = 'buy' AND owner_address = ${owner_address}
            ) AS unique_assets
            GROUP BY asset_address;
        `;

        // ONLY FOR UPDATES WITH BIRDEYE AND BE
        // const result = await this.retryWithBackoff(
        //   () => this.callBird(owner_address, "solana", null, null, "holdings"),
        //   MAX_RETRIES,
        //   INITIAL_RETRY_DELAY_MS
        // );

        // if (!result || !result.data || !result.data.items) {
        //   console.log("no result for holdings", result);
        // }

        // const holdings = result.data.items;
        // const totalUsd = result.data.totalUsd;

        // uniqueAssetsByOwner.map((a) => {
        //   this.processData({
        //     ...a,
        //     asset_holdings_token:
        //       holdings.find((h) => h.address === a.asset_address)?.uiAmount ||
        //       0,
        //     asset_holdings_usd:
        //       holdings.find((h) => h.address === a.asset_address)?.valueUsd ||
        //       0,
        //     owner_address,
        //     total_wallet_value_usd: totalUsd,
        //     updated_at,
        //     sol_token:
        //       holdings.find(
        //         (h) =>
        //           h.address === "So11111111111111111111111111111111111111111"
        //       )?.uiAmount || 0,
        //     sol_usd_value:
        //       holdings.find(
        //         (h) =>
        //           h.address === "So11111111111111111111111111111111111111111"
        //       )?.valueUsd || 0,

        //     update_method: "db",
        //   });
        // });
        const b = uniqueAssetsByOwner.map((a) => {
          this.processData({
            ...a,
            owner_address,
            updated_at,
            sol_usd_value: 0,
            update_method: "db",
          });
        });
      });

      await Promise.all(promises);

      console.timeEnd(`Processing traders ${i} to ${i + 60}`);

      //   FOR WHEN HAVE BIRDEYE IN UPDATES
      const processingTime = Date.now() - startTime;

      if (processingTime < 2000) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 - processingTime)
        );
      }
    }
  }
  /* 

//   get all tokens we are tracking
//   get all unique traders in the db
//   

*/

  // Main method to execute the price analysis
  async main() {
    // await prisma.trader_asset_summary.deleteMany({});
    // Example usage:
    try {
      await this.fillByUniqueTrader();
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

// get unique traders from txns, get their earliest txn time from DB
//
// check birdeye api to see if they have txns before that time
//
// get earliest txn time of less than 2 days ago and test against holdings
//
// really only need to check birdeye one time for each token when its new to the DB (so token oder)

/////import Prisma from "@prisma/client";
import fetch from "node-fetch";
import { Mutex } from "async-mutex";

const API_KEY_BIRD = "";

const prisma = new Prisma.PrismaClient();
const lastRunUnixTime = 0; // looking for unique traders since this last run
const lastMaxOrderBirdeye = 0; // the highest order that we've checked for prev txn in birdeye
const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY_MS = 1000;

class ReccuringTraders {
  constructor() {
    this.apiKey = API_KEY_BIRD; // API key for the data provider
    this.baseUrl = "https://public-api.birdeye.so"; // Base URL for the API
    this.lastRunUnixTime = lastRunUnixTime; // looking for unique traders since this last run
    this.lastMaxOrderBirdeye = lastMaxOrderBirdeye; // the highest order that we've checked for prev txn in birdeye
    this.mutex = new Mutex(); // Initialize a new Mutex
    this.activeBuffer = [];
    this.batchSize = 250; /// Adjust this to the desired batch size
    this.tradersAdded = 0;
  }

  async callBird(
    address,
    chain = "solana",
    offset = 0,
    limit = 50,
    url = "tokenlist"
  ) {
    try {
      let endpoint;
      if (url === "tokenlist") {
        endpoint = `${this.baseUrl}/defi/txs/token?address=${address}&limit=${limit}&offset=${offset}`;
      } else if (url === "security") {
        endpoint = `${this.baseUrl}/defi/token_security?address=${address}`;
      } else if (url === "holdings") {
        endpoint = `${this.baseUrl}/v1/wallet/token_list?wallet=${address}`;
      }

      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "x-chain": chain,
          "X-API-KEY": this.apiKey,
        },
      });
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

  //   async helius() {
  //     const options = {
  //       headers: {
  //         apiKey: "821503a6-f7d6-4782-bd20-cddae427bce0",
  //       },
  //     };

  //     const address = "GGPiThvLX6K3CEB8uaqpXBX6iZPVtT5EYnUBgQnGGUAJ";
  //     let url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${options.headers.apiKey}`;
  //     // const response = await fetch(
  //     // url
  //     // );
  //     // const x = await response.json();
  //     // console.log(x);

  //     // x.map((txn) => console.log({desc: txn.description, }));

  //     let lastSignature = null;

  //     const fetchAndParseTransactions = async () => {
  //       while (true) {
  //         if (lastSignature) {
  //           url += `&before=${lastSignature}`;
  //         }
  //         const response = await fetch(url);
  //         const transactions = await response.json();

  //         if (transactions && transactions.length > 0) {
  //           // console.log("Fetched transactions: ", transactions);
  //           // console.log(transactions.description, transactions)
  //           transactions.map((txn) => console.log(txn.description));
  //           console.log("time", transactions[transactions.length - 1].timestamp);

  //           lastSignature = transactions[transactions.length - 1].signature;
  //         } else {
  //           console.log("No more transactions available.");
  //           break;
  //         }
  //       }
  //     };
  //     fetchAndParseTransactions();
  //   }

  //   async getTraderTxns() {
  //     console.log("Fetching earliest txns...");
  //     const start = Date.now();

  //     const tokens = ["3psH1Mj1f7yUfaD5gh6Zj7epE8hhrMkMETgv5TshQA4o"];

  //     const t = await prisma.tokens_to_track.findMany({
  //       where: {
  //         address: tokens[0],
  //       },
  //       orderBy: {
  //         order: "asc",
  //       },
  //     });

  //     for (const token of t) {
  //       const txns = await prisma.txns.findMany({});

  //       const firstTxn = await prisma.txns.findFirst({
  //         where: {
  //           OR: [
  //             { to_address: token.address, side: "buy" },
  //             { from_address: token.address, side: "sell" },
  //           ],
  //         },
  //         orderBy: {
  //           block_unix_time: "asc",
  //         },
  //       });

  //       const firstTxnTime = firstTxn.block_unix_time;
  //       console.log(firstTxnTime);

  //       //   const result = await this.findOffsetFromBirdeye(
  //       //     firstTxnTime,
  //       //     token.address,
  //       //     token.chain
  //       //   );

  //       //   console.log(result, "found offset?");

  //       //   concurrently grab all txns before that time from birdeye api without overwhelming RPM 1000 limit
  //       //   find the new earliest txn time and repeat until we have all the txns

  //       // save to a json file for testing purposes
  //       //
  //     }

  //     const elapsedTimeInSeconds = (Date.now() - start) / 1000;
  //     console.log(`Elapsed time: ${elapsedTimeInSeconds} seconds`);
  //     return "done";
  //   }

  //   async findEarliestTransactionsForOwner(ownerAddress) {
  //     const query = `
  //       WITH buy_earliest AS (
  //           SELECT
  //               owner_address,
  //               to_address AS asset,
  //               MIN(block_unix_time) AS earliest_time
  //           FROM
  //               transactions
  //           WHERE
  //               side = 'buy'
  //           GROUP BY
  //               owner_address, to_address
  //       ),
  //       sell_earliest AS (
  //           SELECT
  //               owner_address,
  //               from_address AS asset,
  //               MIN(block_unix_time) AS earliest_time
  //           FROM
  //               transactions
  //           WHERE
  //               side = 'sell'
  //           GROUP BY
  //               owner_address, from_address
  //       )
  //       SELECT
  //           t1.tx_hash,
  //           t1.owner_address,
  //           t1.block_unix_time,
  //           t1.to_address AS asset,
  //           t1.from_address,
  //           t1.side,
  //           t1.price,
  //           t1.units,
  //           t1.smoothed_price
  //       FROM
  //           transactions t1
  //       JOIN
  //           buy_earliest be ON t1.owner_address = be.owner_address AND t1.block_unix_time = be.earliest_time AND t1.to_address = be.asset AND t1.side = 'buy'
  //       UNION ALL
  //       SELECT
  //           t2.tx_hash,
  //           t2.owner_address,
  //           t2.block_unix_time,
  //           t2.from_address AS asset,
  //           t2.to_address,
  //           t2.side,
  //           t2.price,
  //           t2.units,
  //           t2.smoothed_price
  //       FROM
  //           transactions t2
  //       JOIN
  //           sell_earliest se ON t2.owner_address = se.owner_address AND t2.block_unix_time = se.earliest_time AND t2.from_address = se.asset AND t2.side = 'sell'
  //       WHERE
  //           t1.owner_address = $1 OR t2.owner_address = $1
  //       ORDER BY
  //           owner_address, asset, block_unix_time;
  //     `;

  //     const results = await prisma.$queryRaw(query, ownerAddress);
  //     console.log(results);
  //   }

  //   async hm() {
  //     // const tokens_tracking = await prisma.tokens_to_track.findMany({
  //     //   where: {
  //     //     chain: "solana",
  //     //   },
  //     //   orderBy: { order: "asc" },
  //     // });

  //     // const traders = await prisma.txns.findMany({});

  //     console.log("test");
  //     const firstTxns = await prisma.$queryRaw`
  //     WITH buy_earliest AS (
  //         SELECT
  //             owner_address,
  //             to_address AS asset,
  //             MIN(block_unix_time) AS earliest_time
  //         FROM
  //             txns
  //         WHERE
  //             side = 'buy'
  //         GROUP BY
  //             owner_address, to_address
  //     ),
  //     sell_earliest AS (
  //         SELECT
  //             owner_address,
  //             from_address AS asset,
  //             MIN(block_unix_time) AS earliest_time
  //         FROM
  //             txns
  //         WHERE
  //             side = 'sell'
  //         GROUP BY
  //             owner_address, from_address
  //     )
  //     SELECT
  //         t1.tx_hash,
  //         t1.owner_address,
  //         t1.block_unix_time,
  //         t1.to_address AS asset,
  //         t1.from_address,
  //         t1.side,
  //         t1.price,
  //         t1.units,
  //         t1.smoothed_price
  //     FROM
  //         txns t1
  //     JOIN
  //         buy_earliest be ON t1.owner_address = be.owner_address AND t1.block_unix_time = be.earliest_time AND t1.to_address = be.asset AND t1.side = 'buy'
  //     UNION ALL
  //     SELECT
  //         t2.tx_hash,
  //         t2.owner_address,
  //         t2.block_unix_time,
  //         t2.from_address AS asset,
  //         t2.to_address,
  //         t2.side,
  //         t2.price,
  //         t2.units,
  //         t2.smoothed_price
  //     FROM
  //         txns t2
  //     JOIN
  //         sell_earliest se ON t2.owner_address = se.owner_address AND t2.block_unix_time = se.earliest_time AND t2.from_address = se.asset AND t2.side = 'sell'
  //     ORDER BY
  //         owner_address, asset, block_unix_time
  //     limit 10;
  //   `;
  //     console.log(firstTxns, "f");
  //   }

  async flushBuffer(batch) {
    if (batch.length === 0) return;

    const x = await this.retryWithBackoff(
      () => {
        return prisma.trader_asset_summary.createMany({
          data: batch,
          //   skipDuplicates: true, // Optionally skip duplicates
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
    console.log("fetching traders");
    const traders = await prisma.$queryRaw`
        select distinct owner_address
        from txns
        where owner_address NOT LIKE '0x%';
    `;

    // 10 at a time

    // for when excluding trader_Asset_summaries that already exist
    // but of course then need to update token balances in holdings
    /*
SELECT asset_address, MIN(block_unix_time) AS earliest_time
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
ON unique_assets.asset_address = tas.asset_address AND tas.owner_address = ${owner_address}
WHERE tas.id IS NULL
GROUP BY asset_address;

    */
    for (let i = 0; i < traders.length; i += 1) {
      //   const startTime = Date.now();
      const updated_at = Math.floor(Date.now() / 1000);

      const { owner_address } = traders[i];

      const uniqueAssetsByOwner = await this.retryWithBackoff(
        () => prisma.$queryRaw`
          SELECT asset_address, MIN(block_unix_time) AS first_txn_unix
          FROM (
              SELECT from_address AS asset_address, block_unix_time
              FROM txns
              WHERE side = 'sell' AND owner_address = ${owner_address}
              UNION
              SELECT to_address AS asset_address, block_unix_time
              FROM txns
              WHERE side = 'buy' AND owner_address = ${owner_address}
          ) AS unique_assets
          GROUP BY asset_address;
      `,
        MAX_RETRIES,
        INITIAL_RETRY_DELAY_MS
      );

      // ONLY FOR UPDATES WITH BIRDEYE AND BE
      // const result = await this.retryWithBackoff(
      //   () => this.callBird(owner_address, "solana", null, null, "holdings"),
      //   MAX_RETRIES,
      //   INITIAL_RETRY_DELAY_MS
      // );

      // if (!result || !result.data || !result.data.items) {
      //   console.log("no result for holdings", result);
      // }

      // const holdings = result.data.items;
      // const totalUsd = result.data.totalUsd;

      // uniqueAssetsByOwner.map((a) => {
      //   this.processData({
      //     ...a,
      //     asset_holdings_token:
      //       holdings.find((h) => h.address === a.asset_address)?.uiAmount ||
      //       0,

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

      //   FOR WHEN HAVE BIRDEYE IN UPDATES
      //   const processingTime = Date.now() - startTime;

      //   if (processingTime < 3500) {
      //     await new Promise((resolve) =>
      //       setTimeout(resolve, 3500 - processingTime)
      //     );
      //   }
    }

    // clean up buffer
    await this.flushBuffer(this.activeBuffer);
    this.activeBuffer.length = 0;

    console.log("done");
  }
  /* 

//   get all tokens we are tracking
//   get all unique traders in the db
//   

*/

  // Main method to execute the price analysis
  async main() {
    // await prisma.trader_asset_summary.deleteMany({});
    // Example usage:
    try {
      await this.fillByUniqueTrader();
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

// get unique traders from txns, get their earliest txn time from DB
//
// check birdeye api to see if they have txns before that time
//
// get earliest txn time of less than 2 days ago and test against holdings
//
// really only need to check birdeye one time for each token when its new to the DB (so token oder)
