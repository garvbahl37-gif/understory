/**
 * Domain vocabulary for the Understory supply-chain graph.
 *
 * These names map 1:1 onto node labels and relationship types in CognoDB, so
 * the graph model and the TypeScript model never drift apart.
 */

export const NODE_LABELS = [
  "Team",
  "Service",
  "Package",
  "Version",
  "Maintainer",
  "Advisory",
  "License",
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];

export const RELATIONSHIP_TYPES = [
  "OWNS",
  "CALLS",
  "USES",
  "HAS_VERSION",
  "DEPENDS_ON",
  "SUPERSEDES",
  "LICENSED_UNDER",
  "MAINTAINS",
  "PUBLISHED",
  "AFFECTS",
  "SIMILAR_TO",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export const SERVICE_TIERS = ["critical", "standard", "internal"] as const;
export type ServiceTier = (typeof SERVICE_TIERS)[number];

export const ECOSYSTEMS = ["npm", "pypi", "maven", "cargo", "go"] as const;
export type Ecosystem = (typeof ECOSYSTEMS)[number];

export const LICENSE_CATEGORIES = [
  "permissive",
  "weak-copyleft",
  "strong-copyleft",
  "network-copyleft",
  "source-available",
  "unknown",
] as const;
export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];

/** Categories that create an obligation when shipped in a distributed product. */
export const CONTAMINATING_CATEGORIES: LicenseCategory[] = [
  "strong-copyleft",
  "network-copyleft",
  "source-available",
  "unknown",
];

export const DEPENDENCY_SCOPES = ["runtime", "dev", "optional", "peer"] as const;
export type DependencyScope = (typeof DEPENDENCY_SCOPES)[number];

// ── Row shapes returned by the query layer ─────────────────────────────────

export type LabelCount = { label: string; count: number };
export type TypeCount = { type: string; count: number };

export type SeverityCount = { severity: Severity; advisories: number };

export type ExposedService = {
  slug: string;
  name: string;
  tier: ServiceTier;
  teamName: string | null;
  advisories: number;
  criticalAdvisories: number;
  shipsExternally: boolean;
};

export type AdvisorySummary = {
  id: string;
  source: string;
  title: string;
  severity: Severity;
  cvss: number;
  publishedAt: string;
  exploitKnown: boolean;
  verified: boolean;
  cwe: string | null;
  affectedVersions: number;
  affectedPackages: string[];
  affectedServices: number;
  criticalServices: number;
};

export type BlastRadiusRow = {
  serviceSlug: string;
  serviceName: string;
  tier: ServiceTier;
  shipsExternally: boolean;
  teamSlug: string | null;
  teamName: string | null;
  hops: number;
  scope: DependencyScope;
  entryPackage: string;
  vulnerableVersion: string;
  chain: string[];
  distinctRoutes: number;
};

export type UpgradeSuggestion = {
  currentVersion: string;
  fixedVersion: string | null;
  fixedSemver: string | null;
  releasesAhead: number | null;
  releaseChain: string[];
  declaredFixedIn: string | null;
};

export type ServiceSummary = {
  slug: string;
  name: string;
  tier: ServiceTier;
  language: string;
  shipsExternally: boolean;
  description: string;
  teamSlug: string | null;
  teamName: string | null;
  directDependencies: number;
  advisories: number;
  criticalAdvisories: number;
};

export type PackageSummary = {
  key: string;
  name: string;
  ecosystem: Ecosystem;
  description: string;
  weeklyDownloads: number;
  deprecated: boolean;
  versions: number;
  maintainers: number;
  advisories: number;
  dependentServices?: number;
};

export type ChokepointRow = {
  packageKey: string;
  name: string;
  ecosystem: Ecosystem;
  weeklyDownloads: number;
  dependentServices: number;
  criticalServices: number;
  busFactor: number;
  maintainersWithout2fa: number;
  maintainerHandles: string[];
  riskScore: number;
};

export type LicenseExposureRow = {
  serviceSlug: string;
  serviceName: string;
  tier: ServiceTier;
  teamName: string | null;
  license: string;
  licenseName: string;
  category: LicenseCategory;
  version: string;
  hops: number;
  chain: string[];
  distinctVersions: number;
};

export type TyposquatRow = {
  suspectKey: string;
  suspectName: string;
  suspectDownloads: number;
  suspectFirstPublished: string;
  legitKey: string;
  legitName: string;
  legitDownloads: number;
  editDistance: number;
  kind: string;
  servicesAtRisk: number;
  suspectMaintainers: string[];
};

export type InheritedExposureRow = {
  callerSlug: string;
  callerName: string;
  callerTier: ServiceTier;
  calleeSlug: string;
  calleeName: string;
  callHops: number;
  callChain: string[];
  advisoryId: string;
  advisoryTitle: string;
  severity: Severity;
  packageKey: string;
};

export type MaintainerRiskRow = {
  handle: string;
  name: string;
  twoFactorEnabled: boolean;
  publicPackages: number;
  joinedAt: string;
  packages: number;
  dependentServices: number;
  criticalServices: number;
  topPackages: string[];
};

export type GraphNode = {
  id: string;
  label: NodeLabel;
  caption: string;
  sub?: string;
  severity?: Severity | null;
  tier?: ServiceTier | null;
  meta?: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  meta?: Record<string, unknown>;
};

export type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  seed: { id: string; label: NodeLabel };
};
