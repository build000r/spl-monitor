import Prisma from "@prisma/client";
import util from "util";
import fetch from "node-fetch";

const prisma = new Prisma.PrismaClient();

const API_KEY_BIRD = env("API_KEY_BIRD");
const BASE_URL = "https://public-api.birdeye.so";

const callBird = async (address) => {
  try {
    const response = await fetch(
      // `${BASE_URL}/defi/history_price?address=${address}&address_type=token&limit=${limit}`,
      `${BASE_URL}/defi/token_overview?address=${address}`,
      {
        method: "GET",
        headers: {
          "x-chain": "base",
          "X-API-KEY": API_KEY_BIRD,
        },
      }
    );
    //   if (!response.ok) throw new Error(`Network response was not ok: ${response}`);
    const json = await response.json();

    // console.log(json.data.tokens[0]);
    return json.data;
  } catch (error) {
    console.error("Error:", error);
  }
};
import fs from "fs";

async function main() {
  // const hm = await prisma.txns.findFirst({
  //   where: {
  //     AND: [
  //       { to_address: "6Fb84TUdMNAVgwRinLeTgLov8dJnk5yhNt41Xq2a6s4c" },
  //       { side: "buy" },
  //     ],
  //   },
  // });
  // console.log(hm);
  // return;
  // read data from tokens_to_track json
  const tk = await prisma.tokens_to_track.findMany({
    orderBy: {
      order: "desc",
    },
  });

  let addresses = ["0xE3086852A4B125803C815a158249ae468A3254Ca"];

  // remove any addresses that are already in the db
  const existingAddresses = tk.map((t) => t.address);
  const newAddresses = addresses.filter((a) => !existingAddresses.includes(a));

  console.log(tk.length, "num of tokens", tk[0]);

  console.log(newAddresses.length, "new addresses");
  let order = tk[0].order + 1;

  let toInsert = [];
  for (let i = 0; i < newAddresses.length; i++) {
    const element = newAddresses[i];
    const data = await callBird(element);
    if (data?.address) {
      const { address, symbol } = data;

      const insert = {
        address,
        symbol,
        chain: "base",
        order,
      };
      order += 1;
      toInsert.push(insert);

      console.log(insert);
    } else {
      console.log("no data for ", element, data);
    }
  }

  console.log("adding ", toInsert.length, "tokens");

  const newTokens = await prisma.tokens_to_track.createMany({
    data: toInsert,
  });

  console.log(newTokens);

  return;

  const tp = [
    {
      address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
      decimals: 6,
      lastTradeUnixTime: 1712886400,
      liquidity: 41369462.37727496,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreibk3covs5ltyqxa272uodhculbr6kea6betidfwy3ajsav2vjzyum.ipfs.nftstorage.link",
      mc: 3446414562.1410675,
      name: "dogwifhat",
      symbol: "$WIF",
      v24hChangePercent: -20.41502139440806,
      v24hUSD: 66755604.90837334,
    },

    {
      address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      decimals: 6,
      lastTradeUnixTime: 1712886400,
      liquidity: 86172736.29603748,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fstatic.jup.ag%2Fjup%2Ficon.png",
      mc: 12724029171.504898,
      name: "Jupiter",
      symbol: "JUP",
      v24hChangePercent: 20.388710860607713,
      v24hUSD: 54779961.99724847,
    },

    {
      address: "PUPS8ZgJ5po4UmNDfqtDMCPP6M1KP3EEzG9Zufcwzrg",
      decimals: 9,
      lastTradeUnixTime: 1712886402,
      liquidity: 1977233.6356894523,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Ftoken-ndllmwrhm.pages.dev%2Fpups%2Ficon.png",
      mc: 75504769.34542082,
      name: "PUPS",
      symbol: "PUPS",
      v24hChangePercent: 78.59418478962714,
      v24hUSD: 39120021.89013714,
    },
    {
      address: "BJB5tHWAHboMAwti5AHbCNX17F3jL8ehkh4zuTUx99Zn",
      decimals: 6,
      lastTradeUnixTime: 1712886402,
      liquidity: 901262.324581447,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fcf-ipfs.com%2Fipfs%2FQmZ4PJT5qZ1MyMwaYz1dbDD3kpBE4bkskwmampKAQWuNRe",
      mc: 11825859.836771432,
      name: "shork",
      symbol: "shork",
      v24hChangePercent: null,
      v24hUSD: 31389903.290265873,
    },

    {
      address: "DPctgrGiqi7oC25ipQgpwByLsRWV4Rv6X3R1A3U5vUQv",
      decimals: 6,
      lastTradeUnixTime: 1712886400,
      liquidity: 184973.7311863974,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fcf-ipfs.com%2Fipfs%2FQmYYfdrJdhJzajgnxwWQNtywwRRh3GdtHA1BW4MKsM2gXH",
      mc: 1780639.4986694346,
      name: "SpongebobAnsemSonic69420wifInuAI",
      symbol: "$DOGE",
      v24hChangePercent: null,
      v24hUSD: 22887503.914170176,
    },
    {
      address: "BeebbdSP9ZvxTRbrBEt8ToMyA4Xkk1SzRvFqykr57ES7",
      decimals: 6,
      lastTradeUnixTime: 1712886384,
      liquidity: 75856.3295267279,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fih1.redbubble.net%2Fimage.1630435809.7076%2Fst%2Csmall%2C507x507-pad%2C600x600%2Cf8f8f8.jpg",
      mc: 226533.4062545314,
      name: "BEEBLE",
      symbol: "BEEBLE",
      v24hChangePercent: null,
      v24hUSD: 21424418.811813086,
    },
    {
      address: "28ZMDMK37zoGbHcgmWn7rb945siZrGbZEgZrG5U3dnVu",
      decimals: 6,
      lastTradeUnixTime: 1712886397,
      liquidity: 107446.59727475066,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fcf-ipfs.com%2Fipfs%2FQmVddesGSL9EH1MGXiS4mXjMUf9YhsQA2KJ31pWKVfsCFq",
      mc: 482455.723325373,
      name: "meep",
      symbol: "meep",
      v24hChangePercent: null,
      v24hUSD: 21377064.87263823,
    },
    {
      address: "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6",
      decimals: 9,
      lastTradeUnixTime: 1712886397,
      liquidity: 6742901.4992738655,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Farweave.net%2FbeGAyeIzjV_UkyjFtxbkZyi_YqfOBWayiQ0B6wqWygY",
      mc: 1394275718.7596295,
      name: "Tensor",
      symbol: "TNSR",
      v24hChangePercent: -28.580674448489724,
      v24hUSD: 20119196.02007032,
    },
    {
      address: "6n7Janary9fqzxKaJVrhL9TG2F61VbAtwUMu1YZscaQS",
      decimals: 6,
      lastTradeUnixTime: 1712886402,
      liquidity: 2001613.3003081982,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fcf-ipfs.com%2Fipfs%2FQmccykK3PtscEH8QpkR54CStmcfpazK4nrf8t167gqML99",
      mc: 23838996.86710638,
      name: "Ansem's Cat",
      symbol: "Hobbes",
      v24hChangePercent: 179.07327750459652,
      v24hUSD: 19738050.015178867,
    },
    {
      address: "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ",
      decimals: 6,
      lastTradeUnixTime: 1712886400,
      liquidity: 14582216.001330204,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fwormhole.com%2Ftoken.png",
      mc: 7951099284.820799,
      name: "Wormhole Token",
      symbol: "W",
      v24hChangePercent: -4.145536672898164,
      v24hUSD: 18393591.74774424,
    },
    {
      address: "GtDZKAqvMZMnti46ZewMiXCa4oXF4bZxwQPoKzXPFxZn",
      decimals: 9,
      lastTradeUnixTime: 1712886401,
      liquidity: 2937646.742944824,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreieny7bfqv76t3pgaaktrrux6j2iflefncegqxmezqsqrzy7kjhhy4.ipfs.nftstorage.link",
      mc: 57660296.81144461,
      name: "nubcat",
      symbol: "nub",
      v24hChangePercent: 5.0221758267023,
      v24hUSD: 18382911.438970793,
    },
    {
      address: "3psH1Mj1f7yUfaD5gh6Zj7epE8hhrMkMETgv5TshQA4o",
      decimals: 9,
      lastTradeUnixTime: 1712886401,
      liquidity: 7974924.865003171,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreid2t4f3i36tq4aowwaaa5633ggslefthxfdudaimog6unwu36umha.ipfs.nftstorage.link",
      mc: 517334670.5822587,
      name: "jeo boden",
      symbol: "boden",
      v24hChangePercent: -29.313308024384565,
      v24hUSD: 18082473.89299558,
    },
    {
      address: "5mbK36SZ7J19An8jFochhQS4of8g6BwUjbeCSxBSoWdp",
      decimals: 6,
      lastTradeUnixTime: 1712886400,
      liquidity: 1125411.3231272593,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fcf-ipfs.com%2Fipfs%2FQmTQrP6R7ieRSbKzwzLAy1i8c2U66b7LM6bSUmK1dfYc5b",
      mc: 13943920.04258819,
      name: "michi",
      symbol: "$michi",
      v24hChangePercent: 0.33305703499231626,
      v24hUSD: 18047195.961762063,
    },
    {
      address: "6D7NaB2xsLd7cauWu1wKk6KBsJohJmP2qZH9GEfVi5Ui",
      decimals: 6,
      lastTradeUnixTime: 1712886395,
      liquidity: 4699268.573991529,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fcf-ipfs.com%2Fipfs%2FQmYZnjijjtoH2YDCPxUc6advSuSbsCre4gDjtS2YTUfw7P",
      mc: 103537520.04621057,
      name: "Shark Cat",
      symbol: "SC",
      v24hChangePercent: 6.343630148607161,
      v24hUSD: 17876557.82648889,
    },
    {
      address: "7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3",
      decimals: 9,
      lastTradeUnixTime: 1712886401,
      liquidity: 87320323.97427431,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreih44n5jgqpwuvimsxzroyebjunnm47jttqusb4ivagw3vsidil43y.ipfs.nftstorage.link",
      mc: 154645402.8288525,
      name: "SLERF",
      symbol: "SLERF",
      v24hChangePercent: 89.53626636808156,
      v24hUSD: 16482102.230805438,
    },
    {
      address: "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm",
      decimals: 9,
      lastTradeUnixTime: 1712886400,
      liquidity: 18847474.11765502,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreiflz2xxkfn33qjch2wj55bvbn33q3s4mmb6bye5pt3mpgy4t2wg4e.ipfs.nftstorage.link%2F",
      mc: 119066658.08548635,
      name: "Infinity",
      symbol: "INF",
      v24hChangePercent: 45.16101174228135,
      v24hUSD: 14542227.7252778,
    },
    {
      address: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
      decimals: 5,
      lastTradeUnixTime: 1712886366,
      liquidity: 34660992.994578674,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreidlwyr565dxtao2ipsze6bmzpszqzybz7sqi2zaet5fs7k53henju.ipfs.nftstorage.link%2F",
      mc: 362226362.9101502,
      name: "cat in a dogs world",
      symbol: "MEW",
      v24hChangePercent: -6.674398619235503,
      v24hUSD: 14532941.169969521,
    },
    {
      address: "2HvhTSeYMpQYBAPutC2eAKGap9hiGPwJeJsGCiTVFCyK",
      decimals: 6,
      lastTradeUnixTime: 1712886401,
      liquidity: 1903388.768367359,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreia64uvvmktx3cxydagosfeuwqzpy7tv4jk2f7odpeccscoly3yrlq.ipfs.nftstorage.link",
      mc: 1272809.1207456372,
      name: "CAT PARTY",
      symbol: "CatParty",
      v24hChangePercent: null,
      v24hUSD: 13614386.536194049,
    },
    {
      address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
      decimals: 9,
      lastTradeUnixTime: 1712886399,
      liquidity: 7884807.924682714,
      logoURI: "https://popcatsol.com/img/logo.png",
      mc: 216079842.4899248,
      name: "POPCAT",
      symbol: "POPCAT",
      v24hChangePercent: 18.994256367539474,
      v24hUSD: 13302022.010588907,
    },
    {
      address: "wo1zgt8rfrYpvdVi4nidoj1SYfcR4pQx69bmNv2JLhQ",
      decimals: 9,
      lastTradeUnixTime: 1712886214,
      liquidity: 537826.5495452988,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreia6ogaqdzbirdorm2mekm25svpd3szrxf7lzdlpn344mysahecd2a.ipfs.nftstorage.link",
      mc: 10032813.558119696,
      name: "JustAnEgg",
      symbol: "EGG",
      v24hChangePercent: 142.9600317727092,
      v24hUSD: 12053213.003664013,
    },
    {
      address: "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk",
      decimals: 5,
      lastTradeUnixTime: 1712886402,
      liquidity: 9369266.108654855,
      logoURI: "https://i.imgur.com/hO4dL01.png",
      mc: 190602119.4191706,
      name: "Wen",
      symbol: "WEN",
      v24hChangePercent: 8.233600532947548,
      v24hUSD: 11528062.350905057,
    },
    {
      address: "CUsEVhFGfjr2wwqjQFd7LrowYy6UhXY2HfAppUzTsihN",
      decimals: 6,
      lastTradeUnixTime: 1712886394,
      liquidity: 2681280.8369876686,
      logoURI:
        "https://imgur.fotofolio.xyz/?url=https%3A%2F%2Fi.imgur.com%2F9EUYHfb.png",
      mc: 95631352.99942468,
      name: "Hump",
      symbol: "HUMP",
      v24hChangePercent: 102.32041041104661,
      v24hUSD: 11361861.36013752,
    },
    {
      address: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
      decimals: 8,
      lastTradeUnixTime: 1712886399,
      liquidity: 7893883.433465703,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2F3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh%2Flogo.png",
      mc: 82128591.33082029,
      name: "Wrapped BTC (Wormhole)",
      symbol: "WBTC",
      v24hChangePercent: -27.904901075373296,
      v24hUSD: 10722899.342720158,
    },
    {
      address: "9EYScpiysGnEimnQPzazr7Jn9GVfxFYzgTEj85hV9L6U",
      decimals: 9,
      lastTradeUnixTime: 1712886391,
      liquidity: 874745.194732964,
      logoURI: "https://i.ibb.co/2vQzqWc/tooker-logo-1.jpg",
      mc: 53822826.081697874,
      name: "tooker kurlson",
      symbol: "tooker",
      v24hChangePercent: 47.29285042233871,
      v24hUSD: 10718743.011060042,
    },
    {
      address: "6dKCoWjpj5MFU5gWDEFdpUUeBasBLK3wLEwhUzQPAa1e",
      decimals: 8,
      lastTradeUnixTime: 1712886399,
      liquidity: 1676909.9260707402,
      logoURI: "https://i.ibb.co/H22zMZZ/main-large-1.png",
      mc: 38764443.85788607,
      name: "Chintai",
      symbol: "CHEX",
      v24hChangePercent: 487.91587662821144,
      v24hUSD: 10625744.649007488,
    },
    {
      address: "GkKTgckaYe8BZx83XQByVgdZP6WEMBDzWM5zvS5u85ic",
      decimals: 9,
      lastTradeUnixTime: 1712886400,
      liquidity: 179898.73320923035,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreic6pomgbifh4nr6qht333enppmrxxgk7wjpk77tuxpawcfqq5dfuy.ipfs.nftstorage.link",
      mc: 2329557.7738666623,
      name: "Pep",
      symbol: "PEP",
      v24hChangePercent: -7.886325666152285,
      v24hUSD: 10160867.701321691,
    },
    {
      address: "8QiFCTauYaPdZmGVt53syMiHPFPv2VP7KVsGCTxUSudz",
      decimals: 9,
      lastTradeUnixTime: 1712886399,
      liquidity: 64748.74953451658,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fgateway.irys.xyz%2Fs4eTOjc9D9ieYezr_lgY8KaHAb4gTGcFhkG_gfvX43A",
      mc: 708891.7870610267,
      name: "Hobbes Wif Hat",
      symbol: "HOBBESWIF",
      v24hChangePercent: null,
      v24hUSD: 10137862.609276857,
    },
    {
      address: "9NTkVivCVcgbMupQiyFMctQzBbbT2AfYaHh9jRTHkHSW",
      decimals: 6,
      lastTradeUnixTime: 1712886400,
      liquidity: 58633.062173249215,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fcf-ipfs.com%2Fipfs%2FQmfES6r2wTLYfbKmvEsfEnZCZfgjc3qr1k1n1ceUdCgaKt",
      mc: 181059.74791936378,
      name: "CatWifUnicorn",
      symbol: "UniCat",
      v24hChangePercent: null,
      v24hUSD: 9672471.804709895,
    },
    {
      address: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
      decimals: 8,
      lastTradeUnixTime: 1712886402,
      liquidity: 8346328.1399716195,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2F7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs%2Flogo.png",
      mc: 77468169.24652888,
      name: "Wrapped Ether (Wormhole)",
      symbol: "WETH",
      v24hChangePercent: -8.167817961359539,
      v24hUSD: 9315870.325157687,
    },
    {
      address: "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82",
      decimals: 6,
      lastTradeUnixTime: 1712886402,
      liquidity: 65116746.786068685,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreihztk5poge7f2lz6logfjmhc7h7u6shvgacoktnuezks5oblmieue.ipfs.nftstorage.link",
      mc: 873808151.6195135,
      name: "BOOK OF MEME",
      symbol: "BOME",
      v24hChangePercent: -23.78721242221672,
      v24hUSD: 8103589.406250086,
    },
    {
      address: "A3eME5CetyZPBoWbRUwY3tSe25S6tb18ba9ZPbWk9eFJ",
      decimals: 6,
      lastTradeUnixTime: 1712886402,
      liquidity: 1822854.9241466594,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreibmv7tbmuqqhm2foemzuy4o4bxqd677r3obw6igrtlmpe5k3j4oge.ipfs.nftstorage.link",
      mc: 35047066.139725365,
      name: "Peng",
      symbol: "PENG",
      v24hChangePercent: 66.86850470852468,
      v24hUSD: 7729138.602097053,
    },
    {
      address: "69kdRLyP5DTRkpHraaSZAQbWmAwzF9guKjZfzMXzcbAs",
      decimals: 6,
      lastTradeUnixTime: 1712886402,
      liquidity: 787531.5362776684,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreib3qfqu5wpwltn5vnr7asnu6vnvvxqm2mrppntqfntoxtqjmypawu.ipfs.nftstorage.link",
      mc: 29249557.823677473,
      name: "American Coin",
      symbol: "USA",
      v24hChangePercent: 55.24940131551931,
      v24hUSD: 7610953.6628492335,
    },
    {
      address: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
      decimals: 6,
      lastTradeUnixTime: 1712886402,
      liquidity: 31506331.08459947,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2F4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R%2Flogo.png",
      mc: 1046673917.8938861,
      name: "Raydium",
      symbol: "RAY",
      v24hChangePercent: -31.675601644768886,
      v24hUSD: 7369492.249398548,
    },
    {
      address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      decimals: 5,
      lastTradeUnixTime: 1712886396,
      liquidity: 24229584.1624484,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Farweave.net%2FhQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
      mc: 2037726358.9011512,
      name: "Bonk",
      symbol: "Bonk",
      v24hChangePercent: 3.7329576211643998,
      v24hUSD: 7039091.487668715,
    },
    {
      address: "Drs17Q9Jy5L6MzX8vATnXxvAd2bfbAWFyrcMAFVMYo7v",
      decimals: 9,
      lastTradeUnixTime: 1712886111,
      liquidity: 20766.306668136178,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreifgw2c4m7tjeksb5tjtrlgsg723ilg4m2ti4xl6lmpiiw72mebrxu.ipfs.nftstorage.link",
      mc: 21700.413641199957,
      name: "QUACK on sol",
      symbol: "QUACK",
      v24hChangePercent: null,
      v24hUSD: 6655051.872429939,
    },
    {
      address: "HXUQvWPWs7BJgzTeX3PyHb8fvFmxvi9Q9hHYzcMVxVbk",
      decimals: 9,
      lastTradeUnixTime: 1712886387,
      liquidity: 2520158.1978173214,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fipfs.coinsult.app%2Fipfs%2FQmWUK9ASZDKzFexV2a6nwyqaFHaY7C3vteipPr7vyAVBvW",
      mc: 3891518.936340254,
      name: "Book of Meow",
      symbol: "BOMEOW",
      v24hChangePercent: -66.98914188964066,
      v24hUSD: 6422474.749636787,
    },
    {
      address: "ZEUS1aR7aX8DFFJf5QjWj2ftDDdNTroMNGo8YoQm3Gq",
      decimals: 6,
      lastTradeUnixTime: 1712886399,
      liquidity: 1313524.736992766,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fraw.githubusercontent.com%2FZeusNetworkHQ%2Fzeus-metadata%2Fmaster%2Flogo-v2.png",
      mc: 718990389.8312696,
      name: "ZEUS",
      symbol: "ZEUS",
      v24hChangePercent: 0.7923882378143843,
      v24hUSD: 6356138.746156719,
    },
    {
      address: "6ktDB8pro2WTCW1WkuevBWs4Jm4B9Y11iJL6TLvmEBey",
      decimals: 9,
      lastTradeUnixTime: 1712886396,
      liquidity: 142480.9768144889,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreifwe2apjzdkxoi7462f33tcyqafrwxbjxvdmtjilora5fjkfayldm.ipfs.nftstorage.link",
      mc: 870110.5456419549,
      name: "jotchua",
      symbol: "jotch",
      v24hChangePercent: -84.00774828011772,
      v24hUSD: 5942751.904781468,
    },
    {
      address: "Adq3wnAvtaXBNfy63xGV1YNkDiPKadDT469xF9uZPrqE",
      decimals: 6,
      lastTradeUnixTime: 1712886391,
      liquidity: 870661.3864729883,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fcf-ipfs.com%2Fipfs%2FQmeqEFthErkc4E5r758Uc3X7hLEyB9S83iWc5ZjcW1C9M3",
      mc: 34370893.62371426,
      name: "What in Tarnation?",
      symbol: "WIT",
      v24hChangePercent: 151.44076643537386,
      v24hUSD: 5894570.936950415,
    },
    {
      address: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
      decimals: 6,
      lastTradeUnixTime: 1712886402,
      liquidity: 6927400.60142283,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fpyth.network%2Ftoken.svg",
      mc: 7686472668.292299,
      name: "Pyth Network",
      symbol: "PYTH",
      v24hChangePercent: -19.252936916547153,
      v24hUSD: 5538112.500976918,
    },
    {
      address: "D8r8XTuCrUhLheWeGXSwC3G92RhASficV3YA7B2XWcLv",
      decimals: 9,
      lastTradeUnixTime: 1712886390,
      liquidity: 1169707.4174334202,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreia7awreq43ql7fa6y5sfpt55vweautbp56gxbqzvbbdobxwtdgdt4.ipfs.nftstorage.link",
      mc: 15418925.43167493,
      name: "catwifbag",
      symbol: "BAG",
      v24hChangePercent: 8.586250819159561,
      v24hUSD: 5479647.29260097,
    },
    {
      address: "71SUn6LsUE8vc49FbekdP7wpmXGrQVspHwQHdRhm5hfg",
      decimals: 6,
      lastTradeUnixTime: 1712886399,
      liquidity: 46089.756841850714,
      logoURI:
        "https://img.fotofolio.xyz/?url=https%3A%2F%2Fcf-ipfs.com%2Fipfs%2FQmUfVEqDCQ7CNbmLDgY9Yo7FA4riMEBnsDMFT33mv3qRqp",
      mc: 132731.40476316877,
      name: "Gently used leather gloves",
      symbol: "OJ",
      v24hChangePercent: null,
      v24hUSD: 5265652.15585611,
    },
  ];

  const tokens = [
    {
      address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
      symbol: "WIF",
      chain: "solana",
    },
  ];

  const token = await prisma.tokens_to_track.createMany({
    data: tp.map((t, i) => {
      t.order = i + t.length;
      return {
        address: t.address,
        symbol: t.symbol,
        chain: "solana",
        order: i + 1 + tk.length,
      };
    }),
    skipDuplicates: true,
  });

  console.log(token);

  const tl = await prisma.tokens_to_track.findMany({
    where: { address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  });

  console.log(tl);

  return;
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
