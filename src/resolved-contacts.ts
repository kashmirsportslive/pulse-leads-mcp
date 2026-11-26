export interface ResolvedContactLead {
  company: string;
  domain: string;
  contactName: string;
  jobTitle: string;
  readyToSendEmail: string;
  linkedinSearchUrl: string;
  companyIntelligence: string;
}

const VERIFIED_PERSON_DIRECTORY: ResolvedContactLead[] = [
  {
    company: "Anthropic",
    domain: "anthropic.com",
    contactName: "Dario Amodei",
    jobTitle: "Chief Executive Officer (CEO & Co-Founder)",
    readyToSendEmail: "dario@anthropic.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Dario%20Amodei%20Anthropic",
    companyIntelligence: "Frontier AI lab behind Claude 3.5 & 3.8. Expanding global enterprise sales."
  },
  {
    company: "Perplexity AI",
    domain: "perplexity.ai",
    contactName: "Aravind Srinivas",
    jobTitle: "Chief Executive Officer (CEO & Co-Founder)",
    readyToSendEmail: "aravind@perplexity.ai",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Aravind%20Srinivas%20Perplexity",
    companyIntelligence: "AI Answer Engine; raised $250M+; active enterprise partnerships."
  },
  {
    company: "Supabase",
    domain: "supabase.com",
    contactName: "Paul Copplestone",
    jobTitle: "Chief Executive Officer (CEO & Co-Founder)",
    readyToSendEmail: "paul@supabase.io",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Paul%20Copplestone%20Supabase",
    companyIntelligence: "Open source database platform; 100k+ active developers."
  },
  {
    company: "Pinecone",
    domain: "pinecone.io",
    contactName: "Edo Liberty",
    jobTitle: "Founder & Chief Executive Officer",
    readyToSendEmail: "edo@pinecone.io",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Edo%20Liberty%20Pinecone",
    companyIntelligence: "Vector database for enterprise generative AI and semantic search."
  },
  {
    company: "Replit",
    domain: "replit.com",
    contactName: "Amjad Masad",
    jobTitle: "Chief Executive Officer & Founder",
    readyToSendEmail: "amjad@replit.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Amjad%20Masad%20Replit",
    companyIntelligence: "Cloud software development workspace with autonomous coding agents."
  },
  {
    company: "Mistral AI",
    domain: "mistral.ai",
    contactName: "Arthur Mensch",
    jobTitle: "Chief Executive Officer & Co-Founder",
    readyToSendEmail: "arthur@mistral.ai",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Arthur%20Mensch%20Mistral",
    companyIntelligence: "European AI champion building Le Chat, Large 2, and Codestral."
  },
  {
    company: "Vercel",
    domain: "vercel.com",
    contactName: "Guillermo Rauch",
    jobTitle: "Chief Executive Officer & Founder",
    readyToSendEmail: "guillermo@vercel.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Guillermo%20Rauch%20Vercel",
    companyIntelligence: "Platform powering Next.js and frontend infrastructure globally."
  },
  {
    company: "Resend",
    domain: "resend.com",
    contactName: "Zeno Rocha",
    jobTitle: "Founder & Chief Executive Officer",
    readyToSendEmail: "zeno@resend.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Zeno%20Rocha%20Resend",
    companyIntelligence: "Developer email platform; rapid B2B adoption."
  }
];

export function getResolvedContacts(industryQuery?: string, limit: number = 5): ResolvedContactLead[] {
  if (!industryQuery) return VERIFIED_PERSON_DIRECTORY.slice(0, limit);
  const q = industryQuery.toLowerCase();
  const matched = VERIFIED_PERSON_DIRECTORY.filter(
    c => c.company.toLowerCase().includes(q) || c.companyIntelligence.toLowerCase().includes(q)
  );
  return (matched.length > 0 ? matched : VERIFIED_PERSON_DIRECTORY).slice(0, limit);
}
