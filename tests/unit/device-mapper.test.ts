import { describe, it, expect } from "vitest";
import { deviceMapper } from "@/core/cli/device-mapper";

describe("DeviceMapper", () => {
  const devices = [
    {
      id: "dev-1",
      hostname: "FGT200F-HQ-PRI",
      model: "FortiGate 200F",
      role: "Primary",
    },
    {
      id: "dev-2",
      hostname: "FGT200F-HQ-SEC",
      model: "FortiGate 200F",
      role: "Secondary",
    },
    {
      id: "dev-3",
      hostname: "FGT80F-BRANCH",
      model: "FortiGate 80F",
      role: "Standalone",
    },
  ];

  it("performs exact case-insensitive match with high confidence and no confirmation needed", () => {
    const result = deviceMapper.mapLogToDevice("fgt200f-hq-pri", devices);

    expect(result.confidence).toBe("EXACT");
    expect(result.matchedDeviceId).toBe("dev-1");
    expect(result.matchedDeviceHostname).toBe("FGT200F-HQ-PRI");
    expect(result.requiresConfirmation).toBe(false);
  });

  it("handles normalized matching ignoring underscores and hyphens", () => {
    const result = deviceMapper.mapLogToDevice("FGT200F_HQ_SEC", devices);

    expect(result.confidence).toBe("HIGH");
    expect(result.matchedDeviceId).toBe("dev-2");
    expect(result.requiresConfirmation).toBe(true);
  });

  it("flags ambiguous matches when prompt hostname could match multiple devices", () => {
    const result = deviceMapper.mapLogToDevice("FGT200F", devices);

    expect(result.confidence).toBe("AMBIGUOUS");
    expect(result.requiresConfirmation).toBe(true);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("suggests single session device with confirmation when prompt hostname is missing", () => {
    const singleDevice = [
      { id: "dev-only", hostname: "CORP-FW-01", model: "FG-100F", role: "Primary" },
    ];
    const result = deviceMapper.mapLogToDevice(undefined, singleDevice);

    expect(result.confidence).toBe("HIGH");
    expect(result.matchedDeviceId).toBe("dev-only");
    expect(result.requiresConfirmation).toBe(true);
  });

  it("returns confidence NONE when hostname does not match any device", () => {
    const result = deviceMapper.mapLogToDevice("UNKNOWN-ROUTER-99", devices);

    expect(result.confidence).toBe("NONE");
    expect(result.requiresConfirmation).toBe(true);
  });
});
