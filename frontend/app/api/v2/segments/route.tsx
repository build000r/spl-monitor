import prisma from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address) {
    throw new Error("Address is required");
  }
  const segments = await prisma.segments.findMany({
    // Optionally, add where conditions, select specific fields, etc.
    where: {
      address: address,
    },
    orderBy: {
      end_time: "asc",
    },
  });

  if (!segments) {
    return NextResponse.json(
      { error: "none found" },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return NextResponse.json(
    { data: segments },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
