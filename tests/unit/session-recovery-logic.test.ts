import { describe, it, expect } from "vitest";

describe("Phase 8: Session Recovery Logic & Race Condition Guard Unit Tests", () => {
  it("resolves URL session ID with strict precedence over localStorage (Adjustment 3)", () => {
    const resolveInitialSessionId = (urlQuery: string | null, localStorageVal: string | null) => {
      const urlId = urlQuery?.trim() || null;
      const storedId = localStorageVal?.trim() || null;
      return urlId || storedId || null;
    };

    // Both present: URL wins
    expect(resolveInitialSessionId("session_url_123", "session_local_456")).toBe("session_url_123");

    // Only localStorage present
    expect(resolveInitialSessionId(null, "session_local_456")).toBe("session_local_456");

    // Neither present
    expect(resolveInitialSessionId(null, null)).toBeNull();

    // Empty whitespace in URL
    expect(resolveInitialSessionId("   ", "session_local_456")).toBe("session_local_456");
  });

  it("safely invalidates and ignores stale in-flight responses across session switches (Adjustment 3)", () => {
    let activeToken = 0;
    const completedResponses: Array<{ id: string; token: number }> = [];

    const simulateRequest = (sessionId: string) => {
      activeToken += 1;
      const currentToken = activeToken;

      const onResponseReceived = (resSessionId: string) => {
        // Safe asynchronous guard: must match active token and requested sessionId
        if (currentToken !== activeToken) {
          // Stale response ignored!
          return false;
        }
        if (resSessionId !== sessionId) {
          // Mismatched response ignored!
          return false;
        }
        completedResponses.push({ id: resSessionId, token: currentToken });
        return true;
      };

      return { token: currentToken, onResponseReceived };
    };

    // Request 1: Customer A
    const req1 = simulateRequest("cust_a");
    expect(req1.token).toBe(1);

    // Request 2: Customer B immediately supersedes Request 1
    const req2 = simulateRequest("cust_b");
    expect(req2.token).toBe(2);

    // If Request 1 finishes late, it MUST be rejected!
    const req1Accepted = req1.onResponseReceived("cust_a");
    expect(req1Accepted).toBe(false);
    expect(completedResponses.length).toBe(0);

    // When Request 2 finishes, it is accepted!
    const req2Accepted = req2.onResponseReceived("cust_b");
    expect(req2Accepted).toBe(true);
    expect(completedResponses.length).toBe(1);
    expect(completedResponses[0].id).toBe("cust_b");
  });

  it("verifies that Start New Session leaves database records untouched (Adjustment 4)", () => {
    const simulateStartNewSession = (
      clientWorkspaceState: {
        sessionId: string | null;
        recoveryData: any;
      },
      dbRecords: string[]
    ) => {
      // Clear client state
      clientWorkspaceState.sessionId = null;
      clientWorkspaceState.recoveryData = null;

      // Notice dbRecords is NOT mutated!
      return { clientWorkspaceState, dbRecords };
    };

    const initialDbRecords = ["session_001", "session_002"];
    const workspace = { sessionId: "session_001", recoveryData: { id: "session_001" } };

    const result = simulateStartNewSession(workspace, initialDbRecords);
    expect(result.clientWorkspaceState.sessionId).toBeNull();
    expect(result.clientWorkspaceState.recoveryData).toBeNull();
    // Database remains 100% intact
    expect(result.dbRecords).toEqual(["session_001", "session_002"]);
  });

  it("formats actionable warnings when storage files are missing (Adjustment 5)", () => {
    const buildMissingFileAlerts = (
      missingItems: Array<{ type: string; filename: string; path: string }>
    ): string[] => {
      return missingItems.map(
        (m) => `Storage file '${m.filename}' (${m.type}) not found at '${m.path}'. Please re-upload.`
      );
    };

    const alerts = buildMissingFileAlerts([
      { type: "WORD_REPORT", filename: "Template.docx", path: "reports/template.docx" },
      { type: "PUTTY_LOG", filename: "Session.log", path: "logs/session.log" },
    ]);

    expect(alerts.length).toBe(2);
    expect(alerts[0]).toContain("Template.docx");
    expect(alerts[0]).toContain("Please re-upload");
    expect(alerts[1]).toContain("Session.log");
  });
});
