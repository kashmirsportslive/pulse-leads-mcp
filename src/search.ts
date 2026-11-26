import { queryLeads } from "./leads-engine";
import { getCustomer } from "./billing";

const industryArg = process.argv[2] || "";
const minScoreArg = process.argv[3] ? parseInt(process.argv[3], 10) : 80;

const key = "premium_partner_key";
const customer = getCustomer(key);

console.log("\n=======================================================");
console.log("   ⚡ PULSE-LEADS: AAPKA APNA B2B LEAD SEARCH TOOL ⚡   ");
console.log("=======================================================");
console.log(`[Status] User: Aap (Owner) | Plan: ${customer?.plan.toUpperCase()} | Credits: Unlimited`);
console.log(`[Filter] Industry: '${industryArg || "ALL"}' | Min Intent Score: ${minScoreArg}\n`);

const leads = queryLeads(industryArg || undefined, minScoreArg);

if (leads.length === 0) {
  console.log("❌ Koi matching company nahi mili. Doosri industry try karein.");
} else {
  console.log(`✅ ${leads.length} Verified Companies Mili Hain:\n`);
  leads.forEach((l, idx) => {
    console.log(`[Lead #${idx + 1}] 🏢 ${l.company} (${l.domain})`);
    console.log(`   🏷️  Industry       : ${l.industry}`);
    console.log(`   👤 Decision Maker : ${l.decisionMakerTitle}`);
    console.log(`   📧 Email Format   : ${l.verifiedEmailPattern}`);
    console.log(`   🔥 Buying Intent  : ${l.intentScore}/100`);
    console.log(`   🚨 Hiring Trigger : ${l.recentHiringTrigger}`);
    console.log(`   💻 Tech Stack     : ${l.techStack.join(", ")}`);
    console.log("------------------------------------------------------------------");
  });
}
console.log("\n");
