import readline from "readline";
import { queryLeads } from "./leads-engine";
import { getCustomer, deductCredit } from "./billing";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log("\n=======================================================");
  console.log("   ⚡ PULSE-LEADS: AAPKA APNA B2B LEAD SEARCH TOOL ⚡   ");
  console.log("=======================================================\n");

  const key = "premium_partner_key"; // Aapka master VIP key
  const customer = getCustomer(key);

  console.log(`[Status] Welcome Owner! Aapka Plan: ${customer?.plan.toUpperCase()}`);
  console.log(`[Status] Available Credits: Unlimited (${customer?.creditsRemaining})\n`);

  console.log("Aap kin companies ke decision-makers dhoondhna chahte hain?");
  console.log("Options: 'AI', 'Fintech', 'HealthTech', 'Supply Chain', 'Cybersecurity' ya sabke liye sirf Enter dabayein.\n");

  const industry = await ask("Industry type likhein: ");
  const minScoreInput = await ask("Minimum Buying Intent Score (Default 80, range 50-100): ");
  const minScore = minScoreInput ? parseInt(minScoreInput, 10) : 80;

  console.log("\nSearching database...\n");
  deductCredit(key);
  const leads = queryLeads(industry || undefined, isNaN(minScore) ? 80 : minScore);

  if (leads.length === 0) {
    console.log("❌ Is filter par koi leads nahi mili. Thoda broad filter try karein.");
  } else {
    console.log(`✅ Success! ${leads.length} Verified High-Intent Companies mili hain:\n`);
    leads.forEach((l, idx) => {
      console.log(`------------------- [ Lead #${idx + 1} ] -------------------`);
      console.log(`🏢 Company Name   : ${l.company} (${l.domain})`);
      console.log(`🏷️  Industry       : ${l.industry}`);
      console.log(`👤 Decision Maker : ${l.decisionMakerTitle}`);
      console.log(`📧 Email Pattern  : ${l.verifiedEmailPattern}`);
      console.log(`🔥 Intent Score   : ${l.intentScore}/100 (Bohot high chance hai service lene ka)`);
      console.log(`🚨 Hiring Trigger : ${l.recentHiringTrigger}`);
      console.log(`💻 Tech Stack     : ${l.techStack.join(", ")}`);
      console.log("----------------------------------------------------------\n");
    });
  }

  rl.close();
}

main().catch(console.error);
