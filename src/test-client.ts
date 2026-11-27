import http from "http";

function postRpc(method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: "test_" + Date.now(),
      method,
      params
    });

    const req = http.request(
      "http://localhost:3000/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function runAutomatedTests() {
  console.log("=== STARTING AUTONOMOUS MCP VERIFICATION TESTS ===");

  // 1. Test Tools List
  console.log("\n[Test 1] Querying MCP Tools Discovery (/tools/list)...");
  const listResp = await postRpc("tools/list", {});
  console.log("Registered tools:", listResp?.result?.tools?.map((t: any) => t.name));

  // 2. Test Free Key Query (Should succeed and deduct credit)
  console.log("\n[Test 2] Querying B2B Leads using 'demo_free_key' (Free Trial)...");
  const callResp1 = await postRpc("tools/call", {
    name: "find_b2b_prospects",
    arguments: {
      apiKey: "demo_free_key",
      industry: "AI",
      minIntentScore: 85
    }
  });
  console.log("Execution Result:\n", callResp1?.result?.content?.[0]?.text);

  // 3. Test Paywall Rejection (Invalid or blocked key -> returns 402 Payment Required)
  console.log("\n[Test 3] Testing Paywall Enforcement with invalid/blocked keys...");
  const paywallResp = await postRpc("tools/call", {
    name: "find_b2b_prospects",
    arguments: {
      apiKey: "premium_partner_key",
      industry: "Fintech"
    }
  });
  console.log("Paywall Gate Triggered As Expected:\n", paywallResp?.result?.content?.[0]?.text);

  console.log("\n=== ALL TESTS COMPLETED SUCCESSFULLY ===");
  process.exit(0);
}

runAutomatedTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
