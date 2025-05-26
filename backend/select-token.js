import Prisma from "@prisma/client";
import util from "util";
import websocket from "websocket";
import fs from "fs";
const prisma = new Prisma.PrismaClient();
import fetch from "node-fetch";
import { Parser } from "json2csv";

const API_KEY_BIRD = "";
const BASE_URL = "https://public-api.birdeye.so";

async function retryWithBackoff(fn, maxRetries, delay) {
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

const callBird = async (
  sort_by = "mc",
  sort_type = "asc",
  offset = 309000,
  limit = 50,
  url = "tokenlist",
  address = null
) => {
  try {
    let endpoint;
    if (url === "tokenlist") {
      endpoint = `${BASE_URL}/defi/tokenlist?sort_by=${sort_by}&sort_type=${sort_type}&offset=${offset}&limit=${limit}`;
    } else if (url === "security") {
      endpoint = `${BASE_URL}/defi/token_security?address=${address}`;
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "x-chain": "solana",
        "X-API-KEY": API_KEY_BIRD,
      },
    });
    //   if (!response.ok) throw new Error(`Network response was not ok: ${response}`);
    const json = await response.json();

    // console.log(json.data.tokens[0]);
    if (url === "security" && json.data !== null) {
      json.data.token_address = address;
    }

    return json.data;
  } catch (error) {
    console.error("Error:", error);
  }
};

const findTokenThreshold = async (mcThreshold, mode = "min") => {
  let low = 0;
  let high =
    (await retryWithBackoff(() => callBird("mc", "asc", 0, 1), 3, 1000)).total -
    1; // Fetch a batch of 50 tokens around mid

  // Fetch a batch of 50 tokens around mid
  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    const { tokens } = await retryWithBackoff(
      () => callBird("mc", "asc", mid, 50),
      3,
      1000
    ); // Fetch a batch of 50 tokens around mid

    for (let i = 0; i < tokens.length; i++) {
      let mcValue = tokens[i].mc === null ? 0 : tokens[i].mc;

      if (mode === "min") {
        // Looking for the first token that meets or exceeds the threshold
        if (mcValue >= mcThreshold) {
          if (i === 0) {
            if (mid !== 0) {
              const { tokens: previousTokens } = await retryWithBackoff(
                () => callBird("mc", "asc", mid - 50, 50),
                3,
                1000
              );
              let prevMcValue =
                previousTokens[previousTokens.length - 1].mc === null
                  ? 0
                  : previousTokens[previousTokens.length - 1].mc;
              if (prevMcValue < mcThreshold) {
                console.log(`Offset found: ${mid}`);
                return mid;
              } else {
                high = mid - 1;
                break;
              }
            } else {
              console.log(`Offset found: ${mid}`);
              return mid;
            }
          } else {
            let prevMcValue = tokens[i - 1].mc === null ? 0 : tokens[i - 1].mc;
            if (prevMcValue < mcThreshold) {
              console.log(`Offset found: ${mid + i}`);
              return mid + i;
            }
          }
        }
      } else if (mode === "max") {
        // Looking for the largest token that does not exceed the threshold
        if (mcValue > mcThreshold) {
          if (i === 0) {
            // Back up to previous batch to find the largest below threshold
            high = mid - 1;
            break;
          } else {
            let prevMcValue = tokens[i - 1].mc === null ? 0 : tokens[i - 1].mc;
            console.log(`Offset found: ${mid + i - 1}`);
            return mid + i - 1; // Return the last token before the threshold was exceeded
          }
        }
      }
    }

    if (mode === "min") {
      if (
        tokens[tokens.length - 1].mc === null ||
        tokens[tokens.length - 1].mc < mcThreshold
      ) {
        low = mid + 50;
      } else {
        high = mid - 1;
      }
    } else if (mode === "max") {
      if (tokens[0].mc > mcThreshold) {
        high = mid - 1;
      } else {
        low = mid + 50;
      }
    }
  }

  console.log("No token found matching the specified criteria.");
  return -1; // Indicate no suitable token was found
};

async function evaluateTokens(offset, offsetMax) {
  const batchSize = 50; // Each API call returns 50 tokens
  const rateLimitPerSecond = 15; // Safe number to stay within 750/min limit
  const delayBetweenBatches = 1000 / rateLimitPerSecond; // Delay in milliseconds

  let results = [];
  let currentOffset = offset;

  while (currentOffset <= offsetMax) {
    const promises = [];
    for (let i = 0; i < rateLimitPerSecond && currentOffset <= offsetMax; i++) {
      promises.push(
        retryWithBackoff(
          () => callBird("mc", "asc", currentOffset, batchSize),
          3,
          1000
        )
      );
      currentOffset += batchSize;
    }

    // Wait for all promises in the current batch to resolve
    const batchResults = await Promise.all(promises);

    const batchTokens = batchResults.map((result) => result.tokens).flat();
    // const flatResults = batchResults.flat(); // Flatten results
    // Apply filter based on liquidity

    const filteredTokens = batchTokens.filter(
      (token) =>
        token &&
        token.mc &&
        token.liquidity >= 0.02 * token.mc &&
        token.liquidity <= 0.2 * token.mc
    );
    console.log(
      filteredTokens.length,
      "tokens passed of",
      batchTokens.length,
      "%",
      (filteredTokens.length / batchTokens.length) * 100
    );

    results = results.concat(filteredTokens); // Merge filtered results
    // await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches)); // Respect rate limit
  }

  //   deduplicate results by address field

  console.log(
    results.length,
    " of ",
    offsetMax - offset,
    " tokens passed the filter.",
    "%",
    (results.length / (offsetMax - offset)) * 100,
    "TOTTALS"
  );

  results = results
    .map((t) => {
      return {
        address: t.address,
        name: t.name,
        symbol: t.symbol,
        mc: t.mc,
        liqPercent: t.liquidity / t.mc,
      };
    })
    .sort((a, b) => b.liqPercent - a.liqPercent);

  return results;
}

async function evaluateTokenSecurity(tokenList) {
  const rateLimitPerSecond = 10; // Safe number to stay within 750/min limit
  const delayBetweenBatches = 1000 / rateLimitPerSecond; // Delay in milliseconds

  let results = [];

  for (let i = 0; i < tokenList.length; i += rateLimitPerSecond) {
    const promises = tokenList
      .slice(i, i + rateLimitPerSecond)
      .map((token) =>
        retryWithBackoff(
          () => callBird(null, null, null, null, "security", token.address),
          5,
          1000
        )
      );
    const batchResults = await Promise.all(promises);
    results = results.concat(batchResults); // Merge filtered results

    if (i + rateLimitPerSecond < tokenList.length) {
      // Respect rate limit
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60; // Current Unix timestamp minus 24 hours

  const un = results.filter((r) => r === undefined);
  console.log("undefined results", un.length, un[0]);

  const filtered = results.filter(
    (r) =>
      r !== undefined &&
      (r.ownerPercentage === null || r.ownerPercentage < 0.1) &&
      (r.creatorPercentage === null || r.creatorPercentage < 0.1) &&
      (r.top10HolderPercent === null || r.top10HolderPercent < 0.4) &&
      r.mintTime < oneDayAgo
  );

  console.log(
    "stats on tokens passing security filter",
    filtered.length,
    "of",
    results.length,
    "%",
    (filtered.length / results.length) * 100
  );

  // of these ones that are filtered i actually just want the data from the tokenList

  const filteredAddr = filtered.map((f) => f.token_address);

  const newTokenList = tokenList.filter((t) =>
    filteredAddr.includes(t.address)
  );

  return newTokenList;
}

// Usage of the function with async/await
async function processTokens() {
  const offset = await findTokenThreshold(400000, "min");
  const offsetMax = await findTokenThreshold(10000000000, "max");

  const tokens = await evaluateTokens(offset, offsetMax);

  const filtered = await evaluateTokenSecurity(tokens);

  // to try from file:
  // let filtered;
  // try {
  //   const data = fs.readFileSync("filtered-tokens.json", "utf8");
  //   filtered = JSON.parse(data);
  // } catch (err) {
  //   console.error("Error reading file from disk:", err);
  // }

  const tokensInDb = await prisma.tokens_to_track.findMany({
    orderBy: {
      order: "desc",
    },
  });

  const tokensInDbAddresses = tokensInDb.map((token) => token.address);

  // Filter out the tokens that are already in the database
  const newTokens = filtered.filter(
    (token) => !tokensInDbAddresses.includes(token.address)
  ); // dont want to add tokens that are already in the DB

  console.log("new tokens", newTokens.length, "of", filtered.length, "tokens");

  const created = await prisma.tokens_to_track.createMany({
    data: newTokens.map((token, i) => {
      return {
        address: token.address,
        symbol: token.symbol,
        chain: "solana",
        order: tokensInDb[0].order + i + 1,
      };
    }),
  });

  console.log(created);

  // add these tokens to the DB!
  // new tokens need to have a time_added field

  //   save results to file
  // fs.writeFile(
  //   "filtered-tokens.json",
  //   JSON.stringify(filtered, null, 2),
  //   (err) => {
  //     if (err) {
  //       console.error("Error writing file", err);
  //     } else {
  //       console.log("Successfully wrote file");
  //     }
  //   }
  // );

  // const json2csvParser = new Parser();
  // const csv = json2csvParser.parse(filtered);

  // fs.writeFile("filtered-tokens.csv", csv, (err) => {
  //   if (err) {
  //     console.error("Error writing file", err);
  //   } else {
  //     console.log("Successfully wrote file");
  //   }
  // });
  // make a csv file of it using fs
}

async function main() {
  await processTokens();

  // https://docs.birdeye.so/reference/get_defi-token-security
  // loop through these and determine token security
  // must be older than 24h
}

main();

/*    url = "tokenlist"
  ) {
    try {
      let endpoint;
      if (url === "tokenlist") {
        endpoint = `${this.baseUrl}/defi/txs/token?address=${address}&limit=${limit}&offset=${offset}`;
      } else if (url === "security") {
        endpoint = `${this.baseUrl}/defi/token_security?address=${address}`;
      }
      */
