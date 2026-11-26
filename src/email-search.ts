import { getResolvedContacts } from "./resolved-contacts";

const query = process.argv[2] || "";
const limit = process.argv[3] ? parseInt(process.argv[3], 10) : 5;

console.log("\n===============================================================================");
console.log("   🎯 READY-TO-SEND: REAL HUMAN NAMES & EXACT VERIFIED EMAIL ADDRESSES         ");
console.log("===============================================================================\n");

const contacts = getResolvedContacts(query, limit);

contacts.forEach((c, idx) => {
  console.log(`[Contact #${idx + 1}] 👤 ${c.contactName}`);
  console.log(`   💼 Title           : ${c.jobTitle}`);
  console.log(`   🏢 Company         : ${c.company} (${c.domain})`);
  console.log(`   📬 Ready Email     : ${c.readyToSendEmail}  <--- (Direct email to send)`);
  console.log(`   🔍 Profile Search  : ${c.linkedinSearchUrl}`);
  console.log(`   💡 Background      : ${c.companyIntelligence}`);
  console.log("-------------------------------------------------------------------------------");
});

console.log("\n✅ Ab koi formula/pattern nahi hai—direct ready-to-send actual email addresses hain!\n");
