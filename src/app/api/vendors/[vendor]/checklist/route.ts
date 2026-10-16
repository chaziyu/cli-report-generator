import { NextRequest, NextResponse } from "next/server";
import { vendorRegistry, VendorId } from "@/vendors";
import { validateFortiGateMapping } from "@/vendors/fortigate/checklist";

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

    const checklist = adapter.getChecklistDefinition();
    const commands = adapter.getCommands();

    const bySourceType = {
      CLI: checklist.filter((item) => item.sourceType === "CLI").length,
      GUI_MANUAL: checklist.filter((item) => item.sourceType === "GUI_MANUAL").length,
      EXTERNAL_REFERENCE: checklist.filter(
        (item) => item.sourceType === "EXTERNAL_REFERENCE"
      ).length,
    };

    const groups = Array.from(new Set(checklist.map((item) => item.group)));

    let mappingValidation;
    if (vendor === "fortigate") {
      mappingValidation = validateFortiGateMapping();
    }

    return NextResponse.json({
      success: true,
      data: {
        vendorId: adapter.id,
        displayName: adapter.displayName,
        totalItems: checklist.length,
        totalCommands: commands.length,
        bySourceType,
        groups,
        items: checklist,
        mappingValidation,
      },
    });
  } catch (error) {
    console.error("Failed to load vendor checklist:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load vendor checklist" },
      { status: 500 }
    );
  }
}
