export interface B2BLead {
  company: string;
  domain: string;
  industry: string;
  verifiedEmailPattern: string;
  decisionMakerTitle: string;
  techStack: string[];
  intentScore: number; // 0 - 100
  recentHiringTrigger: string;
}

const LEADS_DATABASE: B2BLead[] = [
  {
    company: "CloudScale AI",
    domain: "cloudscale.ai",
    industry: "AI Infrastructure",
    verifiedEmailPattern: "{first}.{last}@cloudscale.ai",
    decisionMakerTitle: "Head of Infrastructure & AI Engineering",
    techStack: ["Kubernetes", "Next.js", "Python", "GCP", "PostgreSQL"],
    intentScore: 94,
    recentHiringTrigger: "Active openings for 4 AI Engineers and VP of Sales"
  },
  {
    company: "FinVault Global",
    domain: "finvault.io",
    industry: "Fintech & Payments",
    verifiedEmailPattern: "{first}@finvault.io",
    decisionMakerTitle: "Chief Technology Officer (CTO)",
    techStack: ["Stripe", "AWS", "FastAPI", "React", "Snowflake"],
    intentScore: 89,
    recentHiringTrigger: "Raised $12M Series A; expanding merchant onboarding automation"
  },
  {
    company: "BioHealth Synthetics",
    domain: "biohealth.co",
    industry: "HealthTech / BioInformatics",
    verifiedEmailPattern: "{f}{last}@biohealth.co",
    decisionMakerTitle: "Director of Data Platform",
    techStack: ["Google Cloud", "BigQuery", "Terraform", "dbt"],
    intentScore: 82,
    recentHiringTrigger: "Migrating enterprise health analytics pipeline to automated agents"
  },
  {
    company: "OmniLogistics Supply",
    domain: "omnilogistics.net",
    industry: "Supply Chain & Logistics",
    verifiedEmailPattern: "{first}.{last}@omnilogistics.net",
    decisionMakerTitle: "VP of Product & Automation",
    techStack: ["Shopify Plus", "Azure", "Node.js", "Redis"],
    intentScore: 91,
    recentHiringTrigger: "Implementing autonomous freight dispatching agents"
  },
  {
    company: "Apex Cyber Security",
    domain: "apexcyber.com",
    industry: "Cybersecurity",
    verifiedEmailPattern: "{first}_{last}@apexcyber.com",
    decisionMakerTitle: "Chief Information Security Officer (CISO)",
    techStack: ["Rust", "Go", "AWS GuardDuty", "Datadog"],
    intentScore: 96,
    recentHiringTrigger: "Building autonomous threat detection workflows"
  }
];

export function queryLeads(industryFilter?: string, minIntent: number = 70): B2BLead[] {
  return LEADS_DATABASE.filter(lead => {
    const matchesIndustry = !industryFilter || lead.industry.toLowerCase().includes(industryFilter.toLowerCase());
    const matchesIntent = lead.intentScore >= minIntent;
    return matchesIndustry && matchesIntent;
  });
}
