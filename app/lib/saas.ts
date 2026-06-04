export type CustomHostnameStatus =
  | "pending"
  | "active"
  | "active_redeploying"
  | "moved"
  | "pending_deletion"
  | "deleted"
  | "pending_blocked"
  | "pending_migration"
  | "blocked"
  | "any";

export type CustomHostname = {
  id: string;
  hostname: string;
  status: CustomHostnameStatus;
  ssl: {
    status:
      | "initializing"
      | "pending_validation"
      | "pending_issuance"
      | "pending_deployment"
      | "active"
      | "expired"
      | "deleted";
    validation_records?: Array<{
      txt_name?: string;
      txt_value?: string;
      http_url?: string;
      http_body?: string;
    }>;
    validation_errors?: Array<{ message: string }>;
  };
  ownership_verification?: {
    type?: "txt";
    name?: string;
    value?: string;
  };
  verification_errors?: string[];
};

export function isHostnameLive(ch: CustomHostname): boolean {
  return ch.status === "active" && ch.ssl?.status === "active";
}

export function describeHostnameStatus(ch: CustomHostname): {
  label: string;
  detail: string;
  tone: "amber" | "emerald" | "rose" | "ink";
} {
  if (isHostnameLive(ch))
    return { label: "Live with HTTPS", detail: "SSL certificate is active.", tone: "emerald" };
  if (ch.status === "active" && ch.ssl?.status !== "active")
    return {
      label: "Almost there",
      detail: `Domain validated, SSL: ${ch.ssl.status}.`,
      tone: "amber",
    };
  if (ch.ssl?.validation_errors?.length)
    return {
      label: "Validation problem",
      detail: ch.ssl.validation_errors.map((e) => e.message).join("; "),
      tone: "rose",
    };
  if (ch.status === "pending" || ch.ssl?.status === "pending_validation")
    return {
      label: "Waiting on DNS",
      detail:
        "Add the records below. Cloudflare validates and issues SSL automatically once they propagate.",
      tone: "amber",
    };
  return { label: ch.status, detail: ch.ssl?.status ?? "unknown", tone: "ink" };
}
