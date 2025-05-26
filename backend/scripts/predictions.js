import Prisma from "@prisma/client";
import util from "util";
import websocket from "websocket";
import fs from "fs";

// SAME AS OTHER FN IM LAZY
function preprocessPrices(prices) {
  let n = prices.length;

  // Function to calculate the median of an array of values
  function median(values) {
    let sortedValues = [...values].sort((a, b) => a - b);
    let mid = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 0) {
      return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
    } else {
      return sortedValues[mid];
    }
  }

  // Function to calculate a median that filters out extreme outliers
  function filteredMedian(index, window = 3) {
    let neighbors = prices.slice(
      Math.max(0, index - window),
      Math.min(n, index + window + 1)
    );
    let med = median(neighbors);
    let filtered = neighbors.filter((x) => 0.75 * med <= x && x <= 1.25 * med);
    // Return the median of filtered values or the regular median if all are considered outliers
    return filtered.length ? median(filtered) : med;
  }

  for (let i = 1; i < n - 1; i++) {
    let broadMedian = median(
      prices.slice(Math.max(0, i - 2), Math.min(n, i + 3))
    );
    let lowerThreshold = 0.75 * broadMedian;
    let upperThreshold = 1.25 * broadMedian;

    if (prices[i] < lowerThreshold || prices[i] > upperThreshold) {
      let adjMedian = filteredMedian(i); // Get the adjusted median excluding outliers
      console.log(
        `Adjusting price at index ${i} from ${prices[i]} to ${adjMedian}`
      );
      prices[i] = adjMedian; // Apply the adjustment
    }
  }

  return prices;
}

const latestUpdate = 8694; // num of predictions when last updated

const prisma = new Prisma.PrismaClient();

//1
async function fixPricesPredictions() {
  // smooth predicted price predictions by filtering out extreme outliers
  console.log("updating....");
  const predictions = await prisma.predictions.findMany({
    select: {
      id: true,
      predicted_price: true,
      block_unix_timestamp: true,
    },
    orderBy: {
      block_unix_timestamp: "asc",
    },
  });

  // Extract predicted_price values from predictions
  const prices = predictions.map((prediction) => prediction.predicted_price);

  // Preprocess prices
  const preprocessedPrices = preprocessPrices(prices);

  // Map preprocessed prices back to predictions and update in database
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i].predicted_price !== preprocessedPrices[i]) {
      console.log(
        `Updating price at index ${i} from ${predictions[i].predicted_price} to ${preprocessedPrices[i]}`
      );
      await prisma.predictions.update({
        where: { id: predictions[i].id },
        data: { predicted_price: preprocessedPrices[i] },
      });
    }
  }
}

//2
async function fixDirectionAndTrailingPrice() {
  // Get the predictions ordered by block_unix_timestamp
  console.log(
    "fixing trailing 30 and direction.... ",
    "need to fix the trailing30 direction after"
  );
  const predictions = await prisma.predictions.findMany({
    select: {
      id: true,
      current_price: true,
      predicted_price: true,
      trailing_30_predicted_price: true,
      direction: true,
      block_unix_timestamp: true,
    },
    where: {
      id: {
        gt: 1269 + 4660,
      },
    },
    orderBy: {
      block_unix_timestamp: "asc",
    },
  });

  // Calculate trailing_30_predicted_price and direction for each prediction and update in database
  for (let i = 0; i < predictions.length; i++) {
    // Calculate trailing_30_predicted_price
    let trailing_30_predicted_price =
      predictions
        .slice(Math.max(0, i - 29), i + 1)
        .reduce((sum, prediction) => sum + prediction.predicted_price, 0) /
      Math.min(i + 1, 30);

    // Calculate direction
    let direction =
      (predictions[i].predicted_price - predictions[i].current_price) /
      predictions[i].current_price;

    // Update the prediction in the database
    await prisma.predictions.update({
      where: { id: predictions[i].id },
      data: { trailing_30_predicted_price, direction },
    });

    if (
      predictions[i].trailing_30_predicted_price !== trailing_30_predicted_price
    ) {
      console.log(
        `Index ${i}: trailing_30_predicted_price changed from ${predictions[i].trailing_30_predicted_price} to ${trailing_30_predicted_price}`
      );
    }

    if (predictions[i].direction !== direction) {
      console.log(
        `Index ${i}: direction changed from ${predictions[i].direction} to ${direction}`
      );
    }
  }
}

//3
async function fix_trailing_30_direction() {
  // Get the predictions ordered by block_unix_timestamp
  console.log("getting predictions....");
  const predictions = await prisma.predictions.findMany({
    select: {
      id: true,
      current_price: true,
      predicted_price: true,
      trailing_30_predicted_price: true,
      trailing_30_direction: true,
      block_unix_timestamp: true,
    },
    orderBy: {
      block_unix_timestamp: "asc",
    },
    skip: 3100 - 240 + 1914,
  });

  console.log(predictions.length);

  // Calculate trailing_30_direction for each prediction and update in database
  for (let i = 0; i < predictions.length; i++) {
    // Calculate trailing_30_direction
    let trailing_30_direction =
      (predictions[i].trailing_30_predicted_price -
        predictions[i].current_price) /
      predictions[i].current_price;

    // Update the prediction in the database if there is a change
    if (predictions[i].trailing_30_direction !== trailing_30_direction) {
      await prisma.predictions.update({
        where: { id: predictions[i].id },
        data: { trailing_30_direction },
      });

      console.log(
        `Index ${i}: trailing_30_direction changed from ${predictions[i].trailing_30_direction} to ${trailing_30_direction}`
      );
    }
  }

  // Log out the number of changes
  console.log(`predictions updated`);
}

async function deletePredictionsBeforeApril13() {
  // Delete predictions before April 13th, 2021
  const deleteResult = await prisma.predictions.deleteMany({
    where: {
      block_unix_timestamp: {
        lt: 1712966400,
      },
      AND: {
        predicted_price: {
          gt: 1,
        },
      },
    },
  });
  // const earliestPrediction = await
  const d = new Date(1712966400 * 1000);
  console.log(deleteResult, d);
}

async function main() {
  //   await deletePredictionsBeforeApril13();
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
