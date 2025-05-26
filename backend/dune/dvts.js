const tokens = ["3W52uCb8NW8ruMF9mmJX3oKiYAjdPai4633srsZFQCS6"];

import Prisma from "@prisma/client";
import util from "util";
import websocket from "websocket";
import fs from "fs";

const API_DUNE = "";
const prisma = new Prisma.PrismaClient();

async function main() {
  const txns = await prisma.txns.count({
    where: {
      smoothed_price: null,
    },
  });

  console.log(txns, "null smooth");
  const not = await prisma.txns.count({
    NOT: {
      smoothed_price: null,
    },
  });

  console.log(not, "null smooth");
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
