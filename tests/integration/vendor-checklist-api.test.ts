import { describe, it, expect } from "vitest";
import { GET as getVendors } from "@/app/api/vendors/route";
import { GET as getChecklist } from "@/app/api/vendors/[vendor]/checklist/route";
import { GET as getCommands } from "@/app/api/vendors/[vendor]/commands/route";
import { NextRequest } from "next/server";

describe("Vendor Checklist and Commands API Integration", () => {
  it("should return the list of supported vendors including FortiGate", async () => {
    const res = await getVendors();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.some((v: { id: string }) => v.id === "fortigate")).toBe(true);
  });

  it("should return FortiGate checklist with 21 items and mapping validation", async () => {
    const req = new NextRequest("http://localhost:3000/api/vendors/fortigate/checklist");
    const res = await getChecklist(req, {
      params: Promise.resolve({ vendor: "fortigate" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.vendorId).toBe("fortigate");
    expect(json.data.totalItems).toBe(21);
    expect(json.data.bySourceType.CLI).toBe(17);
    expect(json.data.bySourceType.GUI_MANUAL).toBe(2);
    expect(json.data.bySourceType.EXTERNAL_REFERENCE).toBe(2);
    expect(json.data.mappingValidation.isValid).toBe(true);
    expect(json.data.items.length).toBe(21);
  });

  it("should return FortiGate approved commands with collection script", async () => {
    const req = new NextRequest("http://localhost:3000/api/vendors/fortigate/commands");
    const res = await getCommands(req, {
      params: Promise.resolve({ vendor: "fortigate" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.vendorId).toBe("fortigate");
    expect(json.data.totalCommands).toBeGreaterThanOrEqual(11);
    expect(json.data.script).toContain("CTC Global - FortiGate");
    expect(json.data.script).toContain("set output standard");
    expect(json.data.script).toContain("get system performance status");
  });

  it("should return 404 for an unknown vendor", async () => {
    const req = new NextRequest("http://localhost:3000/api/vendors/unknown-vendor/checklist");
    const res = await getChecklist(req, {
      params: Promise.resolve({ vendor: "unknown-vendor" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("unknown-vendor");
  });
});
