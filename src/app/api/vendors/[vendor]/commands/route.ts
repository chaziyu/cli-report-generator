import { NextRequest, NextResponse } from "next/server";
import { vendorRegistry, VendorId } from "@/vendors";
import { generateFortiGateCollectionScript } from "@/vendors/fortigate/commands";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ vendor: string }>;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { vendor } = await params;
    const adapter = vendorRegistry.get(vendor as VendorId);

    if (!adapter) {
      return NextResponse.json(
        { success: false, error: `Vendor adapter "${vendor}" not found` },
        { status: 404 }
      );
    }

    const commands = adapter.getCommands();
    const groups = Array.from(new Set(commands.map((cmd) => cmd.group)));

    let script = "";
    if (vendor === "fortigate") {
      script = generateFortiGateCollectionScript(commands);
    }

    return NextResponse.json({
      success: true,
      data: {
        vendorId: adapter.id,
        displayName: adapter.displayName,
        totalCommands: commands.length,
        groups,
        commands,
        script,
      },
    });
  } catch (error) {
    console.error("Failed to load vendor commands:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load vendor commands" },
      { status: 500 }
    );
  }
}
