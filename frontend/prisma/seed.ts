import prisma from "../lib/prisma";

async function main() {
  console.log("run seed");
  return;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.log(e);
    await prisma.$disconnect();
    process.exit(1);
  });
