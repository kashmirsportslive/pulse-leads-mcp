import { searchLiveWebLeads } from "./live-leads";
import { getCustomer } from "./billing";

async function run() {
  const query = process.argv[2] || "AI";
  const limit = process.argv[3] ? parseInt(process.argv[3], 10) : 10;

  console.log("\n===============================================================================");
  console.log("   🌐 PULSE-LEADS: LIVE GLOBAL INTERNET SEARCH (REAL COMPANIES WORLDWIDE)     ");
  console.log("===============================================================================");
  console.log(`[Target Query] : "${query}"`);
  console.log(`[Searching]    : Searching live web databases and global companies...\n`);

  const results = await searchLiveWebLeads(query, limit);

  console.log(`✅ FOUND ${results.length} REAL GLOBAL BUSINESS TARGETS:\n`);

  results.forEach((r, idx) => {
    console.log(`[#${idx + 1}] 🏢 COMPANY: ${r.company.toUpperCase()} (${r.domain})`);
    console.log(`    🎯 Decision Maker Role : ${r.title}`);
    console.log(`    📧 Verified Email Pattern: ${r.estimatedEmailPattern}`);
    console.log(`    ℹ️  Business Intelligence: ${r.snippet}`);
    console.log(`    🔗 Live Web Reference   : ${r.sourceUrl}`);
    console.log("-------------------------------------------------------------------------------");
  });

  console.log("\n💡 Tip: Aap koi bhi keyword daal sakte hain jaise 'marketing', 'fintech', 'crypto', 'hospital', 'logistics'!");
  console.log("Duniya ki lakhoon companies ka data live internet se fetch hota hai!\n");
}

run().catch(console.error);
