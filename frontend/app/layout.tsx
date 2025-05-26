import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://postgres-prisma.vercel.app"),
  title: "Vercel Postgres Demo with Prisma",
  description:
    "A simple Next.js app with Vercel Postgres as the database and Prisma as the ORM",
};

//@ts-ignore
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head />
      <body style={{ padding: "5px", margin: "5px" }}>
        {/* <WalletProvider wallets={wallets} autoConnect={autoConnect}> */}

        <main className="">{children}</main>
        {/* <WalletConnection /> */}
        {/* </WalletProvider> */}
      </body>
    </html>
  );
}
