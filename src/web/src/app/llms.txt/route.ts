import { connection } from "next/server";
import { llmsResponse } from "@/lib/markdown";

export async function GET() {
  await connection();
  return llmsResponse();
}
