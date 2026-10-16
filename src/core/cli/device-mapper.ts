export interface DeviceCandidate {
  id: string;
  hostname: string;
  model: string | null;
  role: string | null;
}

export type MappingConfidence = "EXACT" | "HIGH" | "AMBIGUOUS" | "NONE";

export interface DeviceMappingResult {
  matchedDeviceId?: string;
  matchedDeviceHostname?: string;
  confidence: MappingConfidence;
  matchReason: string;
  requiresConfirmation: boolean;
  candidates: {
    deviceId: string;
    hostname: string;
    role: string | null;
    score: number;
  }[];
}

export class DeviceMapper {
  /**
   * Maps a detected log hostname to a session's configured devices.
   */
  mapLogToDevice(
    detectedHostname: string | undefined,
    devices: DeviceCandidate[]
  ): DeviceMappingResult {
    if (!detectedHostname || detectedHostname.trim().length === 0) {
      if (devices.length === 1) {
        return {
          matchedDeviceId: devices[0].id,
          matchedDeviceHostname: devices[0].hostname,
          confidence: "HIGH",
          matchReason: `No prompt hostname detected, but session contains only one device ("${devices[0].hostname}").`,
          requiresConfirmation: true,
          candidates: [
            {
              deviceId: devices[0].id,
              hostname: devices[0].hostname,
              role: devices[0].role,
              score: 0.7,
            },
          ],
        };
      }
      return {
        confidence: "NONE",
        matchReason:
          "No firewall hostname could be identified in the prompt, and multiple devices exist in session.",
        requiresConfirmation: true,
        candidates: devices.map((d) => ({
          deviceId: d.id,
          hostname: d.hostname,
          role: d.role,
          score: 0,
        })),
      };
    }

    const cleanDetected = detectedHostname.trim().toLowerCase();

    // 1. Exact match (case-insensitive)
    const exactMatch = devices.find(
      (d) => d.hostname.trim().toLowerCase() === cleanDetected
    );

    if (exactMatch) {
      return {
        matchedDeviceId: exactMatch.id,
        matchedDeviceHostname: exactMatch.hostname,
        confidence: "EXACT",
        matchReason: `Prompt hostname "${detectedHostname}" exactly matches device "${exactMatch.hostname}".`,
        requiresConfirmation: false,
        candidates: [
          {
            deviceId: exactMatch.id,
            hostname: exactMatch.hostname,
            role: exactMatch.role,
            score: 1.0,
          },
        ],
      };
    }

    // 2. Normalized match (ignoring separators: dashes, underscores, spaces)
    const stripSeparators = (s: string) => s.replace(/[\-_ \.]/g, "").toLowerCase();
    const strippedDetected = stripSeparators(detectedHostname);

    const scoredCandidates = devices.map((d) => {
      const strippedHost = stripSeparators(d.hostname);
      let score = 0;

      if (strippedHost === strippedDetected) {
        score = 0.9;
      } else if (
        strippedDetected.includes(strippedHost) ||
        strippedHost.includes(strippedDetected)
      ) {
        score = 0.75;
      }

      return {
        deviceId: d.id,
        hostname: d.hostname,
        role: d.role,
        score,
      };
    });

    scoredCandidates.sort((a, b) => b.score - a.score);

    const bestCandidate = scoredCandidates[0];

    if (bestCandidate && bestCandidate.score >= 0.75) {
      // Check if second best has identical score (ambiguity)
      if (
        scoredCandidates.length > 1 &&
        scoredCandidates[1].score === bestCandidate.score
      ) {
        return {
          confidence: "AMBIGUOUS",
          matchReason: `Multiple devices matched hostname "${detectedHostname}" with equal similarity score.`,
          requiresConfirmation: true,
          candidates: scoredCandidates,
        };
      }

      return {
        matchedDeviceId: bestCandidate.deviceId,
        matchedDeviceHostname: bestCandidate.hostname,
        confidence: "HIGH",
        matchReason: `Prompt hostname "${detectedHostname}" closely matches device "${bestCandidate.hostname}".`,
        requiresConfirmation: true,
        candidates: scoredCandidates,
      };
    }

    // 3. Fallback: If only 1 device in session
    if (devices.length === 1) {
      return {
        matchedDeviceId: devices[0].id,
        matchedDeviceHostname: devices[0].hostname,
        confidence: "AMBIGUOUS",
        matchReason: `Hostname "${detectedHostname}" differs from session device "${devices[0].hostname}". Confirmation required.`,
        requiresConfirmation: true,
        candidates: [
          {
            deviceId: devices[0].id,
            hostname: devices[0].hostname,
            role: devices[0].role,
            score: 0.5,
          },
        ],
      };
    }

    // 4. No reliable match found
    return {
      confidence: "NONE",
      matchReason: `Detected hostname "${detectedHostname}" does not match any configured devices in this session.`,
      requiresConfirmation: true,
      candidates: scoredCandidates,
    };
  }
}

export const deviceMapper = new DeviceMapper();
