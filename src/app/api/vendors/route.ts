import { NextResponse } from "next/server";
import { vendorRegistry } from "@/vendors";

export async function GET() {
  try {
    const vendors = vendorRegistry.getSupportedVendors();
    return NextResponse.json({ success: true, data: vendors });
  } catch (error) {
    console.error("Failed to list vendors:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list vendors" },
      { status: 500 }
    );
  }
}
