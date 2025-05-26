import Prisma from "@prisma/client";
import util from "util";
import websocket from "websocket";
import fs from "fs";
import { Mutex } from "async-mutex";

const prisma = new Prisma.PrismaClient();

/*
    [x] phase 1 just start listeners for all chains
    [x] closing connections
    [x] adding new listeners and closing old ones for less than 100 connections
    [x] test smooth additions and closings of connections adding to existing listener pool (wait for welcome msg and swap)
    [x] concurrency shared activebuffer resource
    [ ] db pooling strategy 
    [ ] handle websocket connection errors
    [ ] smooth crazy prices before insert
*/

const API_KEY_BIRD = "";
const MAX_TOKENS_PER_LISTENER = 100;

const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY_MS = 1000;

class TokenManager {
  constructor(data) {
    this.mutex = new Mutex(); // Initialize a new Mutex
    this.skip = data.skip;
    this.listeners = [];
    this.tokens_tracking;
    this.usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    this.sol = "So11111111111111111111111111111111111111112";
    this.tokens_tracking = [];

    this.activeBuffer = [];
    this.batchSize = 1000; /// Adjust this to the desired batch size
  }

  async retryWithBackoff(fn, maxRetries, delay) {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const result = await fn();
        // console.log("Batch insert results: ", result);
        return;
      } catch (error) {
        console.log(`Batch insert attempt ${attempt + 1} failed:`);
        attempt++;
        if (attempt === maxRetries) {
          console.log("Max retry attempts reached, failing operation", error);
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

    await this.retryWithBackoff(
      () => {
        return prisma.txns.createMany({
          data: batch,
          skipDuplicates: true, // Optionally skip duplicates
        });
      },
      MAX_RETRIES,
      INITIAL_RETRY_DELAY_MS
    );
  }

  async processMessages(message) {
    if (!message.data) return;
    let txn = message.data;

    //
    // PREPROCESS DATA
    //

    if (!txn.side) {
      if (txn.to.address === this.usdc || txn.to.address === this.sol) {
        txn.side = "sell";
      } else if (this.tokens_tracking.includes(txn.to.address)) {
        txn.side = "buy";
      } else if (this.tokens_tracking.includes(txn.from.address)) {
        txn.side = "sell";
      } else {
        // console.log("Unknown transaction side, skipping", txn);
        return;
      }
    }

    const relevantSide = txn.side === "buy" ? txn.to : txn.from;

    // Calculate the units
    const units = relevantSide.amount / Math.pow(10, relevantSide.decimals);
    if (units === 0) {
      //   console.log("Units cannot be zero, skipping transaction"); //, txn);
      return;
    }

    // Calculate the price per unit
    const pricePerUnit = txn.volumeUSD / units;

    if (
      isNaN(pricePerUnit) ||
      pricePerUnit === Infinity ||
      pricePerUnit === -Infinity
    ) {
      //   console.log("Invalid price per unit, skipping transaction", txn);
      return;
    }

    let processedTxn = {
      tx_hash: txn.txHash
        ? txn.txHash
        : `no-tx-hash-${Date.now()}-${Math.random()}`,
      owner_address: txn.owner,
      block_unix_time: txn.blockUnixTime,
      to_address: txn.to.address,
      from_address: txn.from.address,
      side: txn.side,
      price: pricePerUnit,
      units: units,
    };

    if (
      !Object.values(processedTxn).every(
        (value) => value !== null && value !== undefined
      )
    ) {
      console.log(
        "Skipping transaction with missing data: ",
        processedTxn,
        txn
      );
      return;
    }

    const release = await this.mutex.acquire();
    let batch = [];

    try {
      if (this.activeBuffer.length >= this.batchSize - 1) {
        batch = [...this.activeBuffer, processedTxn];
        this.activeBuffer.length = 0;
      } else {
        this.activeBuffer.push(processedTxn);
      }
    } finally {
      release();
    }

    if (batch.length > 0) {
      await this.flushBuffer(batch);
    }

    //
    // old stuff below
    //
  }

  async initTokenListers() {
    // add a pause to tokens to track?
    const tokens = await prisma.tokens_to_track.findMany({
      orderBy: {
        order: "asc",
      },
      skip: this.skip,
    });

    this.skip += tokens.length;
    this.tokens_tracking = tokens.map((token) => token.address);

    console.log(this.skip, "tokens tracking on start");

    const tokensByChain = tokens.reduce((acc, token) => {
      (acc[token.chain] = acc[token.chain] || []).push(token.address);
      return acc;
    }, {});

    for (const [chain, addresses] of Object.entries(tokensByChain)) {
      this.processChainListeners(chain, addresses);
    }

    // // save this as JSON
    // fs.writeFile("tokens.json", JSON.stringify(tokens, null, 2), (err) => {
    //   if (err) {
    //     console.error("Error writing file", err);
    //   } else {
    //     console.log("Successfully wrote file");
    //   }
    // });
    // return;

    setTimeout(async () => {
      await this.checkForNewTokens();
    }, 10000);
  }

  async checkForNewTokens() {
    const tokens = await prisma.tokens_to_track.findMany({
      orderBy: {
        order: "asc",
      },
      skip: this.skip,
    });

    if (tokens.length === 0) {
      setTimeout(async () => {
        await this.checkForNewTokens();
      }, 60000);
      return;
    }

    this.skip += tokens.length;

    console.log("adding new tokens: ", tokens.length);
    console.log("total tokens tracking: ", this.skip);

    // add up the sum of the tokens in the this.listener
    let listenertokens = [];

    this.listeners.map((l) => {
      listenertokens = [...listenertokens, ...l.tokens];
    });

    // remove duplicates form listenertokens
    listenertokens = [...new Set(listenertokens)];

    console.log("total tokens in listeners: ", listenertokens.length);

    console.log();

    this.tokens_tracking = [
      ...this.tokens_tracking,
      ...tokens.map((token) => token.address),
    ];

    const tokensByChain = tokens.reduce((acc, token) => {
      (acc[token.chain] = acc[token.chain] || []).push(token.address);
      return acc;
    }, {});

    for (const [chain, addresses] of Object.entries(tokensByChain)) {
      const chainListener = this.listeners.find(
        (listener) => listener.chain === chain && listener.tokens.length < 100
      );

      const newAddresses = [...addresses, ...chainListener.tokens];

      this.processChainListeners(chain, newAddresses, chainListener);
    }

    setTimeout(async () => {
      await this.checkForNewTokens();
    }, 60000);
  }

  processChainListeners(chain, addresses, listenerToReplace = null) {
    let batch = [];

    addresses.forEach((address) => {
      if (batch.length === MAX_TOKENS_PER_LISTENER) {
        this.startListener(chain, batch, listenerToReplace);
        batch = [];
      }
      batch.push(address);
    });

    if (batch.length > 0) {
      this.startListener(chain, batch, listenerToReplace);
    }
  }

  startListener(chain, tokenBatch, listenerToReplace = null) {
    const client = new websocket.client();

    client.on("connectFailed", (error) => {
      console.log("Connect Error: " + error.toString());
    });

    client.on("connect", (connection) => {
      console.log("WebSocket Client Connected");

      connection.on("error", (error) => {
        console.log("Connection Error: " + error.toString());
      });

      connection.on("close", (e) => {
        /*
            we know the connection was not supposed to closeif the listener is still in the list

            so we look for listeners in the list that are connected: false
            we call startListener with the chain and tokens of the listener
            we remove the previous listener from the list
            we log that this happened

        */

        // connected needs to be true and state needs to be open
        const listeners = this.listeners.filter(
          (l) =>
            l.connection.connected !== true && l.connection.state !== "open"
        );

        if (listeners.length) {
          // start a new listener and remove the other one from the this.listeners list
          listeners.map((l) => {
            console.log("restarting listener");
            this.startListener(l.chain, l.tokens, l);
          });
        }

        console.log("WebSocket Connection Closed");

        // was it supposed to close?
      });

      connection.on("message", (message) => {
        if (message.type === "utf8") {
          const msg = JSON.parse(message.utf8Data);

          if (msg.type.toLowerCase() === "welcome") {
            this.listeners.push({ connection, tokens: tokenBatch, chain }); // Keep track of the listener

            if (listenerToReplace) {
              this.stopListener(listenerToReplace);
            }

            console.log("Received welcome message");
            this.listeners.map((l, i) =>
              console.log("Listener connections on start #", i, {
                connected: l.connection.connected,
                state: l.connection.state,
                tokens: l.tokens.length,
                chain: l.chain,
              })
            );
          } else {
            // console.log(
            //   "Received message: ",
            //   JSON.parse(message.utf8Data).data.from.address
            // );

            this.processMessages(msg);
          }
        }
      });

      this.subscribeTokens(connection, tokenBatch);
    });

    client.connect(
      util.format(
        `wss://public-api.birdeye.so/socket/${chain}?x-api-key=` + API_KEY_BIRD
      ),
      "echo-protocol",
      "https://birdeye.so"
    );
  }

  stopListener(listener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
    listener.connection.close();

    // if stopListener was not called, the listener will still be on the list with a false connected state
    this.listeners.map((l, i) =>
      console.log("Listener connections on stop #", i, {
        connected: l.connection.connected,
        state: l.connection.state,
        tokens: l.tokens.length,
        chain: l.chain,
      })
    );
    console.log("Stopped and removed listener");
  }

  subscribeTokens(connection, tokenBatch) {
    const query = tokenBatch.map((token) => "address = " + token).join(" OR ");
    const subscriptionMsg = {
      type: "SUBSCRIBE_TXS",
      data: {
        queryType: "complex",
        query: query,
      },
    };

    connection.send(JSON.stringify(subscriptionMsg));

    return connection;
  }
}

async function main() {
  const data = { skip: 0 };

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

  const tokenManager = new TokenManager(data);
  await tokenManager.initTokenListers();
}

main()
  .catch((e) => {
    console.error(`An unhandled exception occurred: ${e.message}`);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
