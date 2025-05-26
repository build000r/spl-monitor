import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const tokens_to_track = await prisma.tokens_to_track.findMany({
      // Optionally, add where conditions, select specific fields, etc.
      where: {
        chain: "solana",
      },
      orderBy: {
        order: "asc",
      },
    });
    return NextResponse.json({ data: tokens_to_track });
  } catch (error) {
    console.error("Failed to fetch data: ", error);
    return NextResponse.json({ error: "Failed to fetch data" });
  }
}
