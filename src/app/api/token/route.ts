import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const tokenPath = path.join(process.cwd(), "ws_token.txt");
    const token = fs.readFileSync(tokenPath, "utf-8").trim();
    return NextResponse.json({ token });
  } catch (error) {
    console.error("Failed to read ws_token.txt:", error);
    return NextResponse.json({ error: "Token not found. Is the daemon running?" }, { status: 500 });
  }
}
