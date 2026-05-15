// Domain types shared across pages — mirror BE contract.

export type Role = "Free" | "Plus" | "Premium" | "Admin";
export type Tone = "plain" | "technical";
export type Currency = "EUR" | "GBP" | "USD";
export type BillingCycle = "monthly" | "annual";

export interface User {
  id: string;
  email: string;
  fullName: string;
  dateOfBirth?: string;
  roles: Role[];
  tone: Tone;
  onboardingCompleted: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

/** Matches PlansController response item shape. */
export interface PlanPriceTier {
  priceCents: number;
  price: number;
  stripePriceId: string | null;
}
export interface PlanAnnualTier extends PlanPriceTier {
  annualSavingsCents: number;
  annualSavingsPercent: number;
}
export interface Plan {
  tier: Exclude<Role, "Admin">;
  displayName: string;
  currency: Currency;
  monthly: PlanPriceTier;
  annual: PlanAnnualTier;
  features: string[];
  isFree: boolean;
}
export interface PlansResponse {
  requestedCurrency: Currency;
  supportedCurrencies: Currency[];
  plans: Plan[];
}

/** Matches GET /billing/status. */
export interface BillingStatus {
  currentRole: string;
  status: "Active" | "Canceled" | "Expired";
  nextPaymentDue?: string;
  lastPaymentDate?: string;
  message?: string;
  showUpgradeButton: boolean;
}

/** Matches GET /subscriptions/me. */
export interface MySubscription {
  currentTier: Exclude<Role, "Admin">;
  plan: {
    tier: Exclude<Role, "Admin">;
    displayName: string;
    currency: Currency;
    monthlyPriceCents: number;
    annualPriceCents: number;
  } | null;
  subscription: {
    id: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd?: string;
    canceledAt?: string;
  } | null;
}

export interface Payment {
  id: string;
  paidAt: string;
  paidAtDisplay: string;
  subscriptionPlan: string | null;
  amount: number;
  amountDisplay: string;
  currency: Currency;
  status: "Paid" | "Pending" | "Not Paid";
  isPaid: boolean;
  invoiceDownloadUrl: string | null;
}
export interface PaymentsResponse {
  count: number;
  emptyMessage: string | null;
  payments: Payment[];
}

export type SourceType = "external" | "internal";
export interface ChatSource { type: SourceType; label: string; url?: string; }
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  tone?: Tone;
  category?: "normal" | "greeting" | "toxic";
  blocked?: boolean;
  escalated?: boolean;
  jurisdiction?: string;
  sources?: ChatSource[];
  sourcesTitle?: string;
  disclaimer?: string;
  actions?: ("download" | "save_to_folder")[];
  feedback?: "like" | "dislike" | null;
}

export interface ChatThread {
  id: string;
  title: string;
  lastMessageAt: string;
  messageCount?: number;
}

export interface ChatQuotaPayload {
  tier: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  allowed: boolean;
  resetAtUtc: string;
}
/** Matches GET /chat/tone. */
export interface ChatToneInfo {
  tone: Tone;
  defaultTone: Tone;
  tier: string;
  description: string;
  manualOverrideAvailable: boolean;
  overridden: boolean;
}

export interface ChatQuotaResponse {
  quota: ChatQuotaPayload;
  tone: Tone;
}

/** Matches GET /documents row shape. */
export interface DocFile {
  id: string;
  fileName: string;
  documentType: string;
  tags: string[];
  editedBy: string;
  sizeDisplay: string;
  sizeBytes: number;
  createdAt: string;
  lastModifiedAt: string;
  source: "own" | "shared" | "uploaded";
  actions: string[];
}

export interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  topics: string[];
  publishedAt?: string;
  sourceUrl: string;
  isUnread: boolean;
}

export interface ApiError {
  code?: string;
  message: string;
  errors?: Record<string, string[]>;
}

export interface ComplianceIssue {
  type: "missing" | "risk";
  severity?: "low" | "medium" | "high";
  title: string;
  sourceSnippet: string;
  explanation: string;
  suggestion: string;
}
