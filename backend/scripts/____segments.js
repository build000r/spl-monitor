import Prisma from "@prisma/client";
import fetch from "node-fetch";
import pLimit from "p-limit";
import { exec } from "child_process";

const API_KEY_BIRD = "";
const prisma = new Prisma.PrismaClient();

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
    this.chain = "solana";
  }

  // Method to fetch price data from the API
  async fetchPrice(time, address, range = 60, type = "1m") {
    const before = time - range;
    const after = time + range;
    const url = `${this.baseUrl}/defi/history_price?address=${address}&address_type=token&time_from=${before}&time_to=${after}&type=${type}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-chain": this.chain,
          "X-API-KEY": this.apiKey,
        },
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(
          `API Error: ${response.status} ${JSON.stringify(json)}`
        );
      }
      if (json.data && json.data.items.length) {
        return json.data.items[0];
      } else {
        console.log(
          "No price found, extending range",
          range * 1.2,
          address,
          time
        );
        return await this.fetchPrice(time, address, range * 1.2, type); // Recursive call with extended range
      }
    } catch (error) {
      console.error("Fetch Price Error:", error);
      throw error; // Rethrow to handle retry logic elsewhere
    }
  }

  // Method to get the price range for a specified period
  async getPriceRangeForPeriod(time_from, time_to, address) {
    try {
      const startPrice = await this.retryWithBackoff(
        () => this.fetchPrice(time_from, address),
        3,
        1000
      );
      const endPrice = await this.retryWithBackoff(
        () => this.fetchPrice(time_to, address),
        3,
        1000
      );
      return { startPrice, endPrice };
    } catch (error) {
      console.error("Error getting price range:", error);
      return null;
    }
  }

  // Method to perform operations with retries and exponential backoff
  async retryWithBackoff(fn, maxRetries, delay) {
    let attempts = 0;
    while (attempts < maxRetries) {
      try {
        return await fn();
      } catch (error) {
        attempts++;
        console.log(`Attempt ${attempts}: Retrying after ${delay} ms...`);
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

  async calcData(address, transactions, startTime, endTime) {
    const { startPrice, endPrice } = await this.getPriceRangeForPeriod(
      startTime,
      endTime,
      address
    );

    //
    // NEWNEW
    //

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
    const recc_token_data = {
      new_trader_tokens_bought_48h: firstTraderUnitsBought,
      new_trader_tokens_sold_48h: firstTraderUnitsSold,
      reccuring_trader_tokens_bought_48h: recurringTraderUnitsBought,
      reccuring_trader_tokens_sold_48h: recurringTraderUnitsSold,
      new_traders_48h: firstTraders.length,
      recurring_traders_48h: recurringTraders.length,
      token_buy_volume: tokenBuyVolume,
      token_sell_volume: tokenSellVolume,
    };

    //
    //
    //

    const addressVolumes = transactions.reduce((acc, txn) => {
      const volume = txn.units * (txn.smoothed_price || txn.price);

      if (!txn.smoothed_price) {
        this.noSmooth++;
      } else {
        this.usedSmooth++;
      }

      acc[txn.owner_address] = acc[txn.owner_address] || {
        buy: 0,
        sell: 0,
        net: 0, // Initialize net volume
      };

      if (txn.side === "buy") {
        acc[txn.owner_address].buy += volume;
      } else {
        acc[txn.owner_address].sell += volume;
      }

      // Calculate net volume as buy minus sell
      acc[txn.owner_address].net =
        acc[txn.owner_address].buy - acc[txn.owner_address].sell;

      return acc;
    }, {});

    const categories = {
      whale: { count: 0, bulls: 0, bears: 0 },
      dolphin: { count: 0, bulls: 0, bears: 0 },
      fish: { count: 0, bulls: 0, bears: 0 },
      shrimp: { count: 0, bulls: 0, bears: 0 },
    };
    const categoryVolumes = {
      whale: { buyVolume: 0, sellVolume: 0 },
      dolphin: { buyVolume: 0, sellVolume: 0 },
      fish: { buyVolume: 0, sellVolume: 0 },
      shrimp: { buyVolume: 0, sellVolume: 0 },
    };
    const categoryPercentages = {};

    Object.values(addressVolumes).forEach((volumes) => {
      let categoryKey;

      // Use absolute value for category thresholds
      if (Math.abs(volumes.net) >= 10000) {
        categoryKey = "whale";
      } else if (Math.abs(volumes.net) >= 1000) {
        categoryKey = "dolphin";
      } else if (Math.abs(volumes.net) >= 100) {
        categoryKey = "fish";
      } else {
        categoryKey = "shrimp";
      }

      categories[categoryKey].count++;

      // Determine sentiment using the sign of netVolume
      if (volumes.net >= 0) {
        categories[categoryKey].bulls++;
      } else {
        categories[categoryKey].bears++;
      }

      categoryVolumes[categoryKey].buyVolume += volumes.buy;
      categoryVolumes[categoryKey].sellVolume += volumes.sell;
    });

    const totalBuyVolume = Object.values(categoryVolumes).reduce(
      (sum, category) => sum + category.buyVolume,
      0
    );
    const totalSellVolume = Object.values(categoryVolumes).reduce(
      (sum, category) => sum + category.sellVolume,
      0
    );
    const totalAddresses = Object.values(addressVolumes).length;

    Object.keys(categoryVolumes).forEach((categoryKey) => {
      const categoryData = categories[categoryKey];
      const categoryVolumeData = categoryVolumes[categoryKey];
      categoryPercentages[categoryKey] = {
        percent: (categoryData.count / totalAddresses) * 100,
        bulls:
          categoryData.count > 0
            ? (categoryData.bulls / categoryData.count) * 100
            : 0,
        bears:
          categoryData.count > 0
            ? (categoryData.bears / categoryData.count) * 100
            : 0,
        buyVolumePercent:
          totalBuyVolume !== 0 &&
          !isNaN(categoryVolumeData.buyVolume / totalBuyVolume)
            ? (categoryVolumeData.buyVolume / totalBuyVolume) * 100
            : 0,
        sellVolumePercent:
          totalSellVolume !== 0 &&
          !isNaN(categoryVolumeData.sellVolume / totalSellVolume)
            ? (categoryVolumeData.sellVolume / totalSellVolume) * 100
            : 0,
      };
    });

    Object.keys(categories).forEach((category) => {
      const categoryData = categories[category];
      categoryPercentages[category] = {
        percent: (categoryData.count / totalAddresses) * 100,
        bulls:
          categoryData.count > 0
            ? (categoryData.bulls / categoryData.count) * 100
            : 0,
        bears:
          categoryData.count > 0
            ? (categoryData.bears / categoryData.count) * 100
            : 0,
      };
    });

    const totalVolumes = transactions.reduce(
      (totals, txn) => {
        const volume = txn.units * (txn.smoothed_price || txn.price);

        if (txn.side === "buy") {
          totals.buy += volume; // Accumulate buy volume
        } else if (txn.side === "sell") {
          totals.sell += volume; // Accumulate sell volume
        }

        return totals;
      },
      { buy: 0, sell: 0 }
    ); // Initial totals for buy and sell

    const consolidatedData = {
      categoryDetails: {},
      totalTransactionVolume: {
        buy: totalBuyVolume,
        sell: totalSellVolume,
      },
      startTime,
      endTime,
      address,
      period: this.period, /// -A is just the initial run through
      startPrice: startPrice.value,
      endPrice: endPrice.value,
      priceChangePercent:
        (endPrice.value - startPrice.value) / startPrice.value,
    };

    Object.keys(categoryVolumes).forEach((categoryKey) => {
      const categoryData = categories[categoryKey];
      const categoryVolumeData = categoryVolumes[categoryKey];

      consolidatedData.categoryDetails[categoryKey] = {
        walletPercent: categoryData.count / totalAddresses,
        bulls:
          categoryData.count > 0 ? categoryData.bulls / categoryData.count : 0,
        bears:
          categoryData.count > 0 ? categoryData.bears / categoryData.count : 0,
        buyVolumePercent: !isNaN(categoryVolumeData.buyVolume / totalBuyVolume)
          ? categoryVolumeData.buyVolume / totalBuyVolume
          : 0,
        sellVolumePercent: !isNaN(
          categoryVolumeData.sellVolume / totalSellVolume
        )
          ? categoryVolumeData.sellVolume / totalSellVolume
          : 0,
      };
    });

    //   console.log("consol data", JSON.stringify(consolidatedData, null, 2));
    const createSegmentData = {
      // Relating to the tokens_to_track table by the address field
      ...recc_token_data,
      token: {
        connect: {
          address: consolidatedData.address,
        },
      },
      // Category Details for Whale
      whale_wallet_percent:
        consolidatedData.categoryDetails.whale.walletPercent,
      whale_bulls: consolidatedData.categoryDetails.whale.bulls,
      whale_bears: consolidatedData.categoryDetails.whale.bears,
      whale_buy_volume_percent:
        consolidatedData.categoryDetails.whale.buyVolumePercent,
      whale_sell_volume_percent:
        consolidatedData.categoryDetails.whale.sellVolumePercent,

      // Category Details for Dolphin
      dolphin_wallet_percent:
        consolidatedData.categoryDetails.dolphin.walletPercent,
      dolphin_bulls: consolidatedData.categoryDetails.dolphin.bulls,
      dolphin_bears: consolidatedData.categoryDetails.dolphin.bears,
      dolphin_buy_volume_percent:
        consolidatedData.categoryDetails.dolphin.buyVolumePercent,
      dolphin_sell_volume_percent:
        consolidatedData.categoryDetails.dolphin.sellVolumePercent,

      // Category Details for Fish
      fish_wallet_percent: consolidatedData.categoryDetails.fish.walletPercent,
      fish_bulls: consolidatedData.categoryDetails.fish.bulls,
      fish_bears: consolidatedData.categoryDetails.fish.bears,
      fish_buy_volume_percent:
        consolidatedData.categoryDetails.fish.buyVolumePercent,
      fish_sell_volume_percent:
        consolidatedData.categoryDetails.fish.sellVolumePercent,

      // Category Details for Shrimp
      shrimp_wallet_percent:
        consolidatedData.categoryDetails.shrimp.walletPercent,
      shrimp_bulls: consolidatedData.categoryDetails.shrimp.bulls,
      shrimp_bears: consolidatedData.categoryDetails.shrimp.bears,
      shrimp_buy_volume_percent:
        consolidatedData.categoryDetails.shrimp.buyVolumePercent,
      shrimp_sell_volume_percent:
        consolidatedData.categoryDetails.shrimp.sellVolumePercent,

      // Overall transaction volume details
      total_buy_volume: consolidatedData.totalTransactionVolume.buy,
      total_sell_volume: consolidatedData.totalTransactionVolume.sell,

      // Time and price details
      start_time: consolidatedData.startTime,
      end_time: consolidatedData.endTime,
      period: consolidatedData.period,
      start_price: consolidatedData.startPrice,
      end_price: consolidatedData.endPrice,
      price_change_percent: consolidatedData.priceChangePercent,
    };

    this.createSegment(createSegmentData);
  }

  async createSegment(createSegmentData) {
    await this.retryWithBackoff(
      () =>
        prisma.segments.create({
          data: createSegmentData,
        }),
      3,
      1000
    );
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

  getLatestSixHourIntervalUTC() {
    const currentDate = new Date(); // Get current date and time
    // what is the unix timestamp of the current date ?
    currentDate.setUTCMinutes(0, 0, 0); // Set minutes, seconds, and milliseconds to zero

    // Get the current UTC hour and calculate the last interval
    const currentUTCHours = currentDate.getUTCHours();
    const hoursSinceLastInterval = currentUTCHours % 6;
    const lastIntervalHours = currentUTCHours - hoursSinceLastInterval;

    currentDate.setUTCHours(lastIntervalHours); // Update the hour to the last interval
    const endTime = Math.floor(currentDate.getTime() / 1000); // Unix timestamp in seconds for the end time

    // Calculate the start time, which is 6 hours before the end time
    const startTime = endTime - 6 * 60 * 60; // Subtract 21600 seconds (6 hours)

    return {
      startTime: startTime,
      endTime: endTime,
    };
  }

  async processToken(address, interval) {
    const lastUpdate = await prisma.segments.findFirst({
      where: {
        address: address,
        period: this.period,
      },
      orderBy: {
        end_time: "desc",
      },
    });

    console.log("processing: ", address);

    let stopUnixEndTime = 0;

    if (lastUpdate) {
      if (lastUpdate.end_time >= interval.endTime) {
        console.log(
          "already updated past this time",
          address,
          lastUpdate.end_time,
          interval.endTime
        );
        return;
      }

      stopUnixEndTime = lastUpdate.end_time;
    }

    // move down from loop
    let startTime = interval.startTime;
    let endTime = interval.endTime;

    while (true) {
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

      //   console.log(transactions.length, "new txns");
      if (transactions.length === 0) {
        break;
      } else {
        await this.calcData(address, transactions, startTime, endTime);
      }

      endTime = startTime;
      startTime -= 6 * 60 * 60; // Subtract 21600 seconds (6 hours)

      if (startTime < stopUnixEndTime) {
        break;
      }
    }
  }

  async getUniqueTraders(address, interval) {
    const { startTime, endTime } = interval;
    const result = await prisma.$queryRaw`
      SELECT *
      FROM txns
      WHERE block_unix_time BETWEEN ${startTime} AND ${endTime};
    `;

    // IF THEY HAVE HOLDINGS more than

    console.log(result[0]);

    const uniqueTraders = [...new Set(result.map((r) => r.owner_address))];

    console.log(uniqueTraders.length);
    console.log(uniqueTraders[0]);
    console.log(result.length);
    return result;
  }

  async helius() {
    const options = {
      headers: {
        apiKey: "821503a6-f7d6-4782-bd20-cddae427bce0",
      },
    };

    const address = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
    let symbol = "$WIF";
    let url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${options.headers.apiKey}&type=SWAP`;
    // const response = await fetch(
    // url
    // );
    // const x = await response.json();
    // console.log(x);

    // x.map((txn) => console.log({desc: txn.description, }));

    let lastSignature = null;

    const fetchAndParseTransactions = async () => {
      while (true) {
        if (lastSignature) {
          url += `&before=${lastSignature}`;
        }
        const response = await fetch(url);
        const transactions = await response.json();

        if (transactions && transactions.length > 0) {
          // console.log("Fetched transactions: ", transactions);
          // console.log(transactions.description, transactions)

          for (let i = 0; i < transactions.length; i++) {
            const txn = transactions[i];
            let tokensSold =
              txn.events.swap.tokenInputs
                ?.filter((i) => i.mint.toLowerCase() === address.toLowerCase())
                .map((input) => {
                  // Convert rawTokenAmount to UI amount by dividing by 10^decimals
                  let uiAmount =
                    input.rawTokenAmount.tokenAmount /
                    Math.pow(10, input.rawTokenAmount.decimals);
                  return uiAmount;
                })
                .reduce((a, b) => a + b, 0) || 0; // Sum all UI amounts || 0;

            let tokensBought =
              txn.events.swap.tokenOutputs
                ?.filter((i) => i.mint.toLowerCase() === address.toLowerCase())
                .map((output) => {
                  // Convert rawTokenAmount to UI amount by dividing by 10^decimals
                  let uiAmount =
                    output.rawTokenAmount.tokenAmount /
                    Math.pow(10, output.rawTokenAmount.decimals);
                  return uiAmount;
                })
                .reduce((a, b) => a + b, 0) || 0; // Sum all UI amounts
            let solSold =
              txn.events.swap.nativeInput?.amount / 1_000_000_000 || 0;
            let solBought =
              txn.events.swap.nativeOutput?.amount / 1_000_000_000 || 0;
            const solAddress = () => {
              return txn.description.split(" ")[0].length == 44
                ? txn.description.split(" ")[0]
                : txn.feePayer;
            };

            let side;

            if (txn.events.swap.nativeInput) {
              side = "buy";
            } else if (txn.events.swap.nativeOutput) {
              side = "sell";
            } else if (!side && tokensSold > tokensBought) {
              side = "sell";
            } else if (!side && tokensSold < tokensBought) {
              side = "buy";
            }

            if (tokensSold == tokensBought) {
              continue;
            }

            const tokenInputMint = () => {
              if (!txn.events.swap.tokenInputs.length) {
                console.log(txn.events.swap.innerSwaps[0], "tokenInputMint");

                return txn.events.swap.innerSwaps[0].tokenInputs[0].mint;
              } else return txn.events.swap.tokenInputs[0].mint;
            };
            const tokenOutputMint = () => {
              if (!txn.events.swap.tokenOutputs.length) {
                console.log(txn.events.swap.innerSwaps[0], "tokenOutputMint");

                return txn.events.swap.innerSwaps[0].tokenOutputs[0].mint;
              } else return txn.events.swap.tokenOutputs[0].mint;
            };

            const simplifiedTxn = {
              tx_hash: txn.signature,
              owner_address: solAddress(),
              block_unix_time: txn.timestamp,
              to_address:
                side === "buy"
                  ? address
                  : solBought
                  ? "So11111111111111111111111111111111111111112"
                  : tokenOutputMint(),
              from_address:
                side === "sell"
                  ? address
                  : solSold
                  ? "So11111111111111111111111111111111111111112"
                  : tokenInputMint(),
              side,
              units:
                side == "buy"
                  ? tokensBought - tokensSold
                  : tokensSold - tokensBought,
              price: null,
              description: txn.description,
            };

            // only log if any of the smplifiedTxn fields are null

            // Check for missing fields and log them
            const missingFields = Object.entries(simplifiedTxn).filter(
              ([key, value]) => value == null
            );
            if (missingFields.length > 0) {
              console.log(
                `Transaction with txHash ${
                  simplifiedTxn.tx_hash
                } is missing fields: ${missingFields
                  .map(([key]) => key)
                  .join(", ")}`
              );
              // return null; // Exclude this transaction
            }
          }

          // console.log(transactions[0]);
          // console.log("time", transactions[transactions.length - 1].timestamp);

          lastSignature = transactions[transactions.length - 1].signature;
        } else {
          console.log("No more transactions available.");
          break;
        }
      }
    };
    fetchAndParseTransactions();
  }

  async birdeyeWalletBackfillTxns(
    address = "GGPiThvLX6K3CEB8uaqpXBX6iZPVtT5EYnUBgQnGGUAJ",
    asset = "5mbK36SZ7J19An8jFochhQS4of8g6BwUjbeCSxBSoWdp"
  ) {
    // check trader_asset_summary for existence
    const traderExists = await prisma.trader_asset_summary.findFirst({
      where: {
        owner_address: address,
        asset_address: asset,
      },
    });

    if (traderExists) return;

    // get earliest txn time we have from db
    const options = {
      method: "GET",
      headers: { "x-chain": this.chain, "X-API-KEY": this.apiKey },
    };

    // get wallet history from birdeye
    const walletHistory = await this.retryWithBackoff(
      () => () =>
        fetch(
          `https://public-api.birdeye.so/v1/wallet/tx_list?wallet=${address}`,
          options
        ),
      3,
      1000
    );

    console.log(walletHistory);

    // add to txns table
    // add earliest buy_time to trader_asset_summary
    // add earliest sell_time to trader_asset_summary

    // make trader_asset_summary
    //
  }

  async birdeyeWalletAssumeTxns(
    address = "GGPiThvLX6K3CEB8uaqpXBX6iZPVtT5EYnUBgQnGGUAJ",
    asset = "5mbK36SZ7J19An8jFochhQS4of8g6BwUjbeCSxBSoWdp"
  ) {
    // check trader_asset_summary for existence
    // const traderExists = await prisma.trader_asset_summary.findFirst({
    //   where: {
    //     owner_address: address,
    //     asset_address: asset,
    //   },
    // });

    // if (traderExists) return;

    // sum all txns in db for wallet

    const traderTxns = await prisma.txns.findMany({
      where: {
        owner_address: address,
        OR: [
          { AND: [{ to_address: asset }, { side: "buy" }] },
          { AND: [{ from_address: asset }, { side: "sell" }] },
        ],
      },
    });
    let buy = { units: 0, usd: 0 };
    let sell = { units: 0, usd: 0 };
    let earliest_buy = null;
    let earliest_sell = null;

    for (let i = 0; i < traderTxns.length; i++) {
      const { block_unix_time, smoothed_price, price, side } = traderTxns[i];

      // init earliest buy//sells

      if (earliest_buy == null && side == "buy") {
        earliest_buy = block_unix_time;
      }

      if (earliest_sell == null && side == "sell") {
        earliest_sell = block_unix_time;
      }

      if (side == "buy") {
        buy.units += traderTxns[i].units;
        buy.usd += smoothed_price
          ? smoothed_price * traderTxns[i].units
          : price * traderTxns[i].units;

        if (block_unix_time < earliest_buy) {
          earliest_buy = block_unix_time;
        }
      }

      if (side == "sell") {
        sell.units += traderTxns[i].units;
        sell.usd += smoothed_price
          ? smoothed_price * traderTxns[i].units
          : price * traderTxns[i].units;

        if (block_unix_time < earliest_sell) {
          earliest_sell = block_unix_time;
        }
      }
    }

    // hit birdeye api for wallet token balance
    const options = {
      method: "GET",
      headers: { "x-chain": this.chain, "X-API-KEY": this.apiKey },
    };

    // get wallet token balance from birdeye
    const response = await this.retryWithBackoff(
      () =>
        fetch(
          `https://public-api.birdeye.so/v1/wallet/token_balance?wallet=${address}&token_address=${asset}`,
          options
        ),
      3,
      1000
    );

    const json = await response.json();
    console.log(json.data);

    console.log(buy, sell, earliest_buy, earliest_sell);
    // console.log('buy-sell units', buy.units - sell.units);
    // find the sum of smoothed_price or price if no smoothed price * units

    console.log(traderTxns.length);
    console.log(traderTxns[0]);

    if (buy.units - sell.units > json.data.uiAmount) {
      console.log("missing sells");
    }

    if (buy.units - sell.units < json.data.uiAmount) {
      console.log("missing buys");
    }
    console.log(json.data.uiAmount, buy.units - sell.units, "comparison");
    // if holdings > the sum of txns, first_buy_time prior_txns is true
    //
  }

  // Main method to execute the price analysis
  async main() {
    // const interval = this.getLatestSixHourIntervalUTC();
    // await this.getUniqueTraders(
    //   "3psH1Mj1f7yUfaD5gh6Zj7epE8hhrMkMETgv5TshQA4o",
    //   interval
    // );
    // console.log(interval);

    // WANT THIS DONE FIRST
    // await this.birdeyeWalletAssumeTxns();

    await this.helius();

    return;

    const starting = Date.now();

    const limit = pLimit(20); // Limit concurrency to 20

    console.log("running latest interval: ", interval); // Output the object with start and end times as Unix timestamps

    const tokens = await prisma.tokens_to_track.findMany({
      where: {
        chain: this.chain,
      },
      orderBy: {
        order: "asc",
      },
    });

    const tasks = tokens.map((token) =>
      limit(() => this.processToken(token.address, interval))
    );

    try {
      await Promise.all(tasks);
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

    console.log({
      noSmooth: this.noSmooth,
      smooth: this.usedSmooth,
      perc: this.usedSmooth / (this.noSmooth + this.usedSmooth),
    });

    this.noSmooth = 0;
    this.usedSmooth = 0;

    // for batch processing at 6h time frame
    const currentTime = Math.floor(new Date().getTime() / 1000); // current time in seconds
    let timeUntilNextInterval = interval.endTime + 6 * 60 * 60 - currentTime; // time until the next 6-hour interval
    const nextRunTimestamp = currentTime + timeUntilNextInterval;
    console.log("Next run at Unix timestamp:", nextRunTimestamp);

    if (timeUntilNextInterval < 0) {
      console.log(
        "The next interval has already passed. Running again in 1 second."
      );
      timeUntilNextInterval = 1; // Set a small delay to allow the current execution context to complete
    }

    exec("pm2 start add_z", (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    });

    setTimeout(() => this.main(), timeUntilNextInterval * 1000);
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

// {
//   description: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB swapped 40 SOL for 40.02774081 SOL',
//   type: 'SWAP',
//   source: 'JUPITER',
//   fee: 339691,
//   feePayer: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//   signature: '5ij1kW6JaBNtrKPfb4nceWaN8PrrSsDvMeqviskWJGbER2KRdVxkiyihyGRryR2gP3TFr5uMx5Wj5gPRuQnFejCS',
//   slot: 271440120,
//   timestamp: 1718211907,
//   tokenTransfers: [
//     {
//       fromTokenAccount: '4d8EwcUsTFo4YCMsiUos7ZPfD8d5W6McDgyMovMTdohm',
//       toTokenAccount: '4d8EwcUsTFo4YCMsiUos7ZPfD8d5W6McDgyMovMTdohm',
//       fromUserAccount: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//       toUserAccount: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//       tokenAmount: 40.02774081,
//       mint: 'So11111111111111111111111111111111111111112',
//       tokenStandard: 'Fungible'
//     },
//     {
//       fromTokenAccount: '4d8EwcUsTFo4YCMsiUos7ZPfD8d5W6McDgyMovMTdohm',
//       toTokenAccount: '5i2J61BaZLCWzxrSP1u9HKBxpuMHsjjDiG6fnoiaa3WL',
//       fromUserAccount: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//       toUserAccount: '4E6q7eJE6vBNdquqzYYi5gvzd5MNpwiQKhjbRTRQGuQd',
//       tokenAmount: 40,
//       mint: 'So11111111111111111111111111111111111111112',
//       tokenStandard: 'Fungible'
//     },
//     {
//       fromTokenAccount: 'EhCDC7cUo2kqmRSd1Hxm1FPDhpaqi4sF4EJkBPqXkuVc',
//       toTokenAccount: '2khBfcPQt2U43rhoAn9dVQd5RxFG9NhhpFswvhxKhswU',
//       fromUserAccount: '4E6q7eJE6vBNdquqzYYi5gvzd5MNpwiQKhjbRTRQGuQd',
//       toUserAccount: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//       tokenAmount: 2306.130395,
//       mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
//       tokenStandard: 'Fungible'
//     },
//     {
//       fromTokenAccount: '2khBfcPQt2U43rhoAn9dVQd5RxFG9NhhpFswvhxKhswU',
//       toTokenAccount: 'BfP9MT5XVyJgjbypfPs7r5sQMJeeZnwQcuKrPrHhXGFM',
//       fromUserAccount: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//       toUserAccount: '71p4cjTXT7MFw4LyZ1JJJi5zArbLaTxXF8XtzLLwgZHx',
//       tokenAmount: 2306.130395,
//       mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
//       tokenStandard: 'Fungible'
//     },
//     {
//       fromTokenAccount: 'H9PVMKzgaLDEBxpC5KoTd9TeSf76ko3STfPxAj43uhGV',
//       toTokenAccount: 'GmwSyLgJGgz92bt74C1bCWWThDgEBJof73iR93gFroUT',
//       fromUserAccount: '71p4cjTXT7MFw4LyZ1JJJi5zArbLaTxXF8XtzLLwgZHx',
//       toUserAccount: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//       tokenAmount: 6340.946002,
//       mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
//       tokenStandard: 'Fungible'
//     },
//     {
//       fromTokenAccount: 'GmwSyLgJGgz92bt74C1bCWWThDgEBJof73iR93gFroUT',
//       toTokenAccount: '6mK4Pxs6GhwnessH7CvPivqDYauiHZmAdbEFDpXFk9zt',
//       fromUserAccount: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//       toUserAccount: '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj',
//       tokenAmount: 6340.946002,
//       mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
//       tokenStandard: 'Fungible'
//     },
//     {
//       fromTokenAccount: '6P4tvbzRY6Bh3MiWDHuLqyHywovsRwRpfskPvyeSoHsz',
//       toTokenAccount: '4d8EwcUsTFo4YCMsiUos7ZPfD8d5W6McDgyMovMTdohm',
//       fromUserAccount: '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj',
//       toUserAccount: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//       tokenAmount: 40.02774081,
//       mint: 'So11111111111111111111111111111111111111112',
//       tokenStandard: 'Fungible'
//     },
//     {
//       fromTokenAccount: '',
//       toTokenAccount: '4tZseA4APZsipJ3caVHUe4E1EdTcnMXtXdSwMERh7bVk',
//       fromUserAccount: '',
//       toUserAccount: 'CbYf9QNrkVgNRCMTDiVdvzMqSzXh8AAgnrKAoTfEACdh',
//       tokenAmount: 0.375407263,
//       mint: '6iKQKJwoLsjVEx3xMdiK1Sx3239cJ3Q5aZoGRB5dpxSM',
//       tokenStandard: 'Fungible'
//     }
//   ],
//   nativeTransfers: [],
//   accountData: [
//     {
//       account: '7grEJpUaWyNnXj4ZZherbv59Zc94SgD6T2b6S8YtXALB',
//       nativeBalanceChange: -339691,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '2khBfcPQt2U43rhoAn9dVQd5RxFG9NhhpFswvhxKhswU',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '3TQ3dgdHFiCK9XKgyJ6JQ4ZFf3RXGNfGixw3oABj5kkV',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '4d8EwcUsTFo4YCMsiUos7ZPfD8d5W6McDgyMovMTdohm',
//       nativeBalanceChange: 27740810,
//       tokenBalanceChanges: [Array]
//     },
//     {
//       account: 'GmwSyLgJGgz92bt74C1bCWWThDgEBJof73iR93gFroUT',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'HuPRBxMEXmCNweerMw62Kh8zJ6PaVzPV8hwi4T2ksofo',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'J1JgSt3LVZEBsfU2iU9Yqy9rbnxEM59PVwQVejR66VVk',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '11111111111111111111111111111111',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'ComputeBudget111111111111111111111111111111',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'AV8d95vSx3wFX6u8DqUJfR9cb7woG9qJY8oFDUJeByWu',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '4tZseA4APZsipJ3caVHUe4E1EdTcnMXtXdSwMERh7bVk',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: [Array]
//     },
//     {
//       account: '6iKQKJwoLsjVEx3xMdiK1Sx3239cJ3Q5aZoGRB5dpxSM',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '9xERPkyJuPBnffKX2SswG6r25sJMSyD4hTDqgm8d5QoV',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'BfP9MT5XVyJgjbypfPs7r5sQMJeeZnwQcuKrPrHhXGFM',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: [Array]
//     },
//     {
//       account: 'H9PVMKzgaLDEBxpC5KoTd9TeSf76ko3STfPxAj43uhGV',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: [Array]
//     },
//     {
//       account: '3MsJXVvievxAbsMsaT6TS4i6oMitD9jazucuq3X234tC',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '6P4tvbzRY6Bh3MiWDHuLqyHywovsRwRpfskPvyeSoHsz',
//       nativeBalanceChange: -40027740810,
//       tokenBalanceChanges: [Array]
//     },
//     {
//       account: '6mK4Pxs6GhwnessH7CvPivqDYauiHZmAdbEFDpXFk9zt',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: [Array]
//     },
//     {
//       account: '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'DoPuiZfJu7sypqwR4eiU7C5TMcmmiFoU4HaF5SoD8mRy',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '4E6q7eJE6vBNdquqzYYi5gvzd5MNpwiQKhjbRTRQGuQd',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '5i2J61BaZLCWzxrSP1u9HKBxpuMHsjjDiG6fnoiaa3WL',
//       nativeBalanceChange: 40000000000,
//       tokenBalanceChanges: [Array]
//     },
//     {
//       account: '5s2fWGozS38xidXStXjGwmbedS6CQyoXT7ZbYLPLaSA1',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '8S1DFqyR8LthXmXrr9Qn7fMtqSVU3miT5SQ6Dd9a5Uud',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'CaBQ8AQt1wRhJD5DPW7dpRUVhjcbZ1CxPPGJVZ7fWZH5',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'EhCDC7cUo2kqmRSd1Hxm1FPDhpaqi4sF4EJkBPqXkuVc',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: [Array]
//     },
//     {
//       account: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '71p4cjTXT7MFw4LyZ1JJJi5zArbLaTxXF8XtzLLwgZHx',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'FVAouryrBKKtgSf4jBqU5UwuwwrT6TUniSwQC7TJXDTK',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '9iFER3bpjf1PTTCQCfTRu17EJgvsxo9pVyA9QWwEuX4x',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: 'So11111111111111111111111111111111111111112',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     },
//     {
//       account: '7Nks4GA9SMbkykRdFv222gHoYZc2TzZLhnH7eY1PRYVw',
//       nativeBalanceChange: 0,
//       tokenBalanceChanges: []
//     }
//   ],
//   transactionError: null,
//   instructions: [
//     {
//       accounts: [Array],
//       data: '2HVEByRpLjtVhaCFkDqyaHyaqaFCWvzR2h1FxLiS3MKqDg2F8s5HJ1PC2MBv7',
//       programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
//       innerInstructions: [Array]
//     },
//     {
//       accounts: [],
//       data: '3g5qyTZ49dcK',
//       programId: 'ComputeBudget111111111111111111111111111111',
//       innerInstructions: []
//     },
//     {
//       accounts: [],
//       data: 'FjgCP1',
//       programId: 'ComputeBudget111111111111111111111111111111',
//       innerInstructions: []
//     }
//   ],
//   events: {
//     swap: {
//       nativeInput: [Object],
//       nativeOutput: [Object],
//       tokenInputs: [],
//       tokenOutputs: [],
//       nativeFees: [],
//       tokenFees: [],
//       innerSwaps: [Array]
//     }
//   }
// }
