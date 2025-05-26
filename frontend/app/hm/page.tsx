"use client";

import WhaleChart from "@/components/hm/chart";
import { useSearchParams, useRouter } from "next/navigation";

export default function Segments() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const address = searchParams.get("address") || "";

  return <WhaleChart queryAddress={address} />;
}
