import Prisma from "@prisma/client";
import util from "util";
import websocket from "websocket";
import fs from "fs";

const prisma = new Prisma.PrismaClient();

async function main() {
  // const y = await prisma.txns.findMany();
  // console.log(y.length, "num of txns");
  // getTokenTransactions().then(console.log).catch(console.error);
  //   const pr = await prisma.predictions.deleteMany({
  //     where: {
  //       AND: [
  //         {
  //           OR: [
  //             {
  //               predicted_price: {
  //                 gt: 3,
  //               },
  //             },
  //             {
  //               predicted_price: {
  //                 lt: 0.2,
  //               },
  //             },
  //           ],
  //         },
  //         {
  //           token_address: {
  //             equals: "3psH1Mj1f7yUfaD5gh6Zj7epE8hhrMkMETgv5TshQA4o",
  //           },
  //         },
  //       ],
  //     },
  //   });
  //   console.log(pr);

  // return;
  const tokens_to_track = await prisma.tokens_to_track.findMany();
  // const txns = await prisma.txns.findMany();

  // const byToken = await prisma.$queryRaw`
  //   SELECT t.address, t.symbol, COUNT(*) as txn_count
  //   FROM tokens_to_track AS t
  //   LEFT JOIN txns ON (txns.side = 'sell' AND t.address = txns.from_address)
  //                   OR (txns.side = 'buy' AND t.address = txns.to_address)
  //   GROUP BY t.address, t.symbol
  //   ORDER BY txn_count DESC;`;

  fs.writeFile(
    "tokens_tracking.json",
    JSON.stringify(
      tokens_to_track,
      (key, value) => (typeof value === "bigint" ? value.toString() : value), // replacer function
      2
    ),
    (err) => {
      if (err) {
        console.error("Error writing file", err);
      } else {
        console.log("Successfully wrote to output.json");
      }
    }
  );

  return;
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
