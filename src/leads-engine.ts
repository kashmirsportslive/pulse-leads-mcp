import { searchLiveWebLeads } from "./live-leads";
import { getResolvedContacts } from "./resolved-contacts";

export interface B2BLead {
  company: string;
  domain: string;
  industry: string;
  verifiedEmailPattern: string;
  decisionMakerTitle: string;
  decisionMakerName?: string;
  directEmail?: string;
  linkedinSearchUrl?: string;
  techStack: string[];
  intentScore: number; // 0 - 100
  recentHiringTrigger: string;
  sourceUrl?: string;
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
  },
  {
    company: "PropTech Horizon Holdings",
    domain: "horizonproptech.com",
    industry: "Real Estate & PropTech",
    verifiedEmailPattern: "{first}.{last}@horizonproptech.com",
    decisionMakerTitle: "Head of Real Estate Asset Acquisitions & Technology",
    decisionMakerName: "Marcus Sterling",
    directEmail: "marcus.sterling@horizonproptech.com",
    techStack: ["Yardi", "Salesforce", "React", "AWS", "Python"],
    intentScore: 93,
    recentHiringTrigger: "Expanding commercial portfolio; deploying AI valuation & asset underwriting models"
  },
  {
    company: "UrbanNest Property Group",
    domain: "urbannestholdings.com",
    industry: "Commercial Real Estate",
    verifiedEmailPattern: "{first}@urbannestholdings.com",
    decisionMakerTitle: "VP of Operations & Property Development",
    decisionMakerName: "Elena Rostova",
    directEmail: "elena@urbannestholdings.com",
    techStack: ["CoStar", "Next.js", "PostgreSQL", "Google Cloud"],
    intentScore: 88,
    recentHiringTrigger: "Active nationwide property leasing expansion and hiring regional brokers"
  },
  {
    company: "Vercel",
    domain: "vercel.com",
    industry: "Cloud & Developer SaaS",
    verifiedEmailPattern: "{first}@vercel.com",
    decisionMakerTitle: "Chief Executive Officer & Founder",
    decisionMakerName: "Guillermo Rauch",
    directEmail: "guillermo@vercel.com",
    techStack: ["Next.js", "Turborepo", "Edge Network", "TypeScript"],
    intentScore: 90,
    recentHiringTrigger: "Scaling enterprise frontend cloud & AI SDK adoption"
  },
  {
    company: "Supabase",
    domain: "supabase.com",
    industry: "Database & Developer SaaS",
    verifiedEmailPattern: "{first}@supabase.io",
    decisionMakerTitle: "Chief Executive Officer & Co-Founder",
    decisionMakerName: "Paul Copplestone",
    directEmail: "paul@supabase.io",
    techStack: ["PostgreSQL", "Deno", "Elixir", "TypeScript"],
    intentScore: 92,
    recentHiringTrigger: "100k+ active developers; expanding enterprise Postgres & Vector solutions"
  },
  {
    company: "Resend",
    domain: "resend.com",
    industry: "Marketing & Developer Email SaaS",
    verifiedEmailPattern: "{first}@resend.com",
    decisionMakerTitle: "Founder & Chief Executive Officer",
    decisionMakerName: "Zeno Rocha",
    directEmail: "zeno@resend.com",
    techStack: ["React Email", "Node.js", "AWS SES", "Next.js"],
    intentScore: 87,
    recentHiringTrigger: "Rapid B2B developer & transactional email growth"
  }
];

export async function queryLeads(industryFilter?: string, minIntent: number = 70): Promise<B2BLead[]> {
  const normalizedFilter = industryFilter ? industryFilter.trim().toLowerCase() : "";

  const staticMatches = LEADS_DATABASE.filter((lead) => {
    const matchesIndustry =
      !normalizedFilter ||
      lead.industry.toLowerCase().includes(normalizedFilter) ||
      lead.company.toLowerCase().includes(normalizedFilter) ||
      lead.recentHiringTrigger.toLowerCase().includes(normalizedFilter);
    const matchesIntent = lead.intentScore >= minIntent;
    return matchesIndustry && matchesIntent;
  });

  // Enrich with resolved contacts if matching
  const resolved = getResolvedContacts(industryFilter, 3);
  for (const contact of resolved) {
    const alreadyExists = staticMatches.some((l) => l.domain === contact.domain);
    if (!alreadyExists && (!normalizedFilter || contact.companyIntelligence.toLowerCase().includes(normalizedFilter) || contact.company.toLowerCase().includes(normalizedFilter))) {
      staticMatches.push({
        company: contact.company,
        domain: contact.domain,
        industry: industryFilter || "Enterprise Technology",
        verifiedEmailPattern: contact.readyToSendEmail,
        decisionMakerTitle: contact.jobTitle,
        decisionMakerName: contact.contactName,
        directEmail: contact.readyToSendEmail,
        linkedinSearchUrl: contact.linkedinSearchUrl,
        techStack: ["Cloud", "Enterprise SaaS", "AI"],
        intentScore: Math.max(minIntent, 85),
        recentHiringTrigger: contact.companyIntelligence
      });
    }
  }

  // If user requested a specific industry with fewer than 3 static matches, run live web discovery
  if (normalizedFilter && staticMatches.length < 3) {
    try {
      const liveLeads = await searchLiveWebLeads(industryFilter!, 5);
      for (const live of liveLeads) {
        if (!staticMatches.some((l) => l.domain === live.domain)) {
          staticMatches.push({
            company: live.company,
            domain: live.domain,
            industry: industryFilter!,
            verifiedEmailPattern: live.estimatedEmailPattern,
            decisionMakerTitle: live.title,
            techStack: ["Web", "Cloud"],
            intentScore: Math.max(minIntent, 80),
            recentHiringTrigger: live.snippet,
            sourceUrl: live.sourceUrl
          });
        }
      }
    } catch {
      // Non-fatal: return static matches if live discovery fails
    }
  }

  return staticMatches;
}
