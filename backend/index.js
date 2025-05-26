import Prisma from "@prisma/client";
import util from "util";
import websocket from "websocket";
import fs from "fs";

const prisma = new Prisma.PrismaClient();

const API_KEY_BIRD = env("API_KEY_BIRD");

//****  THIS IS RUNNING ON FIRST 100 solana tokens by order, but just solana ones */

let activeBuffer = [];
const batchSize = 25; /// Adjust this to the desired batch size

// if we never want this to stop, we need to not interrupt this process

const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const sol = "So11111111111111111111111111111111111111112";

let tokens_tracking = [];

const processMessages = async (message) => {
  if (!message.data) return;
  let txn = message.data;

  //
  // PREPROCESS DATA
  //

  if (!txn.side) {
    txn.to.address === usdc && txn.side === "sell";
    txn.to.address === sol && txn.side === "sell";
    tokens_tracking.includes(txn.to.address) && (txn.side = "buy");
    tokens_tracking.includes(txn.from.address) && (txn.side = "sell");
  }

  const relevantSide = txn.side === "buy" ? txn.to : txn.from;

  // Calculate the units
  const units = relevantSide.amount / Math.pow(10, relevantSide.decimals);

  // Calculate the price per unit
  const pricePerUnit = txn.volumeUSD / units;

  // Round the results to 2 decimal places
  // const roundedUnits = Math.round(units * 100) / 100;
  // const roundedPricePerUnit = Math.round(pricePerUnit * 100) / 100;

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

  // if (processedTxn.side == null) {
  //   console.log(" processedTxn.side is null");
  // }

  // if (
  //   isNaN(processedTxn.price) ||
  //   processedTxn.price === Infinity ||
  //   processedTxn.price === -Infinity
  // ) {
  //   console.log(" processedTxn.price is NaN or Infinity", processedTxn, txn);
  // }

  if (
    Object.values(processedTxn).every(
      (value) => value !== null && value !== undefined
    )
  ) {
    if (
      !isNaN(processedTxn.price) &&
      processedTxn.price !== Infinity &&
      processedTxn.price !== -Infinity
    ) {
      activeBuffer.push(processedTxn);
    }
  } else {
    console.log("skipping because didn't have something", processedTxn, txn);
  }

  //
  // BATCH DATA FOR INSERT
  //

  if (activeBuffer.length >= batchSize) {
    const batch = [...activeBuffer];

    activeBuffer.length = 0;

    const tryAgain = async () => {
      try {
        const txnResult = await prisma.txns.createMany({
          data: batch,
          skipDuplicates: true, // Optionally skip duplicates
        });

        console.log(
          "results here: ",
          txnResult,
          " of ",
          batchSize,
          " acvitveBuffer: ",
          batch.length
        );
      } catch (error) {
        console.log(error, "errorbatch: tryagain ", batch);
      }
    };

    try {
      const txnResult = await prisma.txns.createMany({
        data: batch,
        skipDuplicates: true, // Optionally skip duplicates
      });

      console.log(
        "results here: ",
        txnResult,
        " of ",
        batchSize,
        " acvitveBuffer: ",
        batch.length
      );
    } catch (error) {
      tryAgain();
    }
  }
};

async function main() {
  const client = new websocket.client();

  const solanaTokens = await prisma.tokens_to_track.findMany({
    where: {
      chain: "solana",
    },
    orderBy: {
      order: "asc",
    },
    take: 100,
  });

  tokens_tracking = solanaTokens.map((token) => token.address);

  console.log(solanaTokens.length, "num of solana tokens");

  client.on("connectFailed", function (error) {
    console.log("Connect Error: " + error.toString());
  });

  client.on("connect", function (connection) {
    console.log("WebSocket Client Connected");

    connection.on("error", function (error) {
      console.log("Connection Error: " + error.toString());
    });

    connection.on("close", function () {
      console.log("WebSocket Connection Closed");
    });

    connection.on("message", function (message) {
      if (message.type === "utf8") {
        console.log("got message");
        // processMessages(JSON.parse(message.utf8Data));
      }
    });

    // Send subscription message here
    // const subscriptionMsg = {
    //   type: "SUBSCRIBE_TXS",
    //   data: {
    //     queryType: "simple",
    //     address: token[0].address,
    //   },
    // };

    const buildQuery = () =>
      solanaTokens.map((token) => "address = " + token.address).join(" OR ");

    console.log(buildQuery());
    const subscriptionMsg = {
      type: "SUBSCRIBE_TXS",
      data: {
        queryType: "complex",
        query: buildQuery(),
      },
    };

    connection.send(JSON.stringify(subscriptionMsg));
  });

  // Connect to Birdeye WebSocket
  client.connect(
    util.format(
      `wss://public-api.birdeye.so/socket/${solanaTokens[0].chain}?x-api-key=` +
        API_KEY_BIRD
    ),
    "echo-protocol",
    "https://birdeye.so"
  );
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
