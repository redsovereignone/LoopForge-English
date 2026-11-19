// Personal credentials configured under 个人配置 → 个人凭证. Field names match
// the inputs there so the parent page can scroll to and focus the right card.
// Keep the rules in sync with credentialHint in web/app/access.js.
export const CREDENTIALS = {
  codeBuddyApiKey: "CodeBuddy API Key",
  codexApiKey: "Codex API Key",
  claudeCodeApiKey: "Claude Code API Key",
  gitToken: "GitHub Git Token",
  gitSshKey: "Git SSH keys",
  gitHttpCredentials: "Git access tokens",
};

// A CodeBuddy key only works on the edition that issued it, and the CLI
// treats an unrecognized environment as 国际站. Keep in sync with
// CODEBUDDY_ENVIRONMENTS in web/app/workbench.js and
// domain.NormalizeCodeBuddyInternetEnvironment.
export const CODEBUDDY_ENVIRONMENTS = [
  {
    value: "",
    label: "International",
    site: "codebuddy.ai",
    keyUrl: "https://www.codebuddy.ai/profile/keys",
  },
  {
    value: "internal",
    label: "China",
    site: "copilot.tencent.com",
    keyUrl: "https://copilot.tencent.com/profile/",
  },
  {
    value: "ioa",
    label: "iOA",
    site: "tencent.sso.copilot.tencent.com",
    keyUrl: "https://tencent.sso.copilot.tencent.com/profile/keys",
  },
];

const CODEBUDDY_ENVIRONMENT_ALIASES = new Map([
  ["public", ""],
  ["intl", ""],
  ["international", ""],
  ["国际站", ""],
  ["china", "internal"],
  ["cn", "internal"],
  ["国内站", "internal"],
]);

// codeBuddyEnvironment returns null for a value the CLI would not recognize.
// The CLI receives the stored text as-is, so only the exact values count.
export function codeBuddyEnvironment(value) {
  const key = String(value || "").trim();
  return CODEBUDDY_ENVIRONMENTS.find((env) => env.value === key) || null;
}

// codeBuddyEnvironmentIntent guesses what an old free-text value meant
// (china → 国内站) so the fix can be preselected.
export function codeBuddyEnvironmentIntent(value) {
  const key = String(value || "").trim().toLowerCase();
  const normalized = CODEBUDDY_ENVIRONMENT_ALIASES.has(key)
    ? CODEBUDDY_ENVIRONMENT_ALIASES.get(key)
    : key;
  return CODEBUDDY_ENVIRONMENTS.find((env) => env.value === normalized) || null;
}

// codeBuddyEnvironmentLegacy is true for a stored value the CLI does not take
// as written; it connects to 国际站 until the value is saved again.
export function codeBuddyEnvironmentLegacy(value) {
  const raw = String(value || "").trim();
  return !!raw && !codeBuddyEnvironment(raw);
}

export function codeBuddyKeyURL(value) {
  return (codeBuddyEnvironmentIntent(value) || CODEBUDDY_ENVIRONMENTS[0])
    .keyUrl;
}

// Advisory only: a third-party model key is accepted but CodeBuddy answers it
// with 401.
export function codeBuddyKeyWarning(key) {
  const text = String(key || "").trim();
  if (!text || text.startsWith("ck_")) return "";
  return /^sk-/i.test(text)
    ? "CodeBuddy rejects keys from providers such as DeepSeek or OpenAI. Under personal settings, enter the key and base URL for Claude Code or Codex instead."
    : "CodeBuddy API keys usually start with ck_; make sure you copied a CodeBuddy key";
}

// Where and how to get each credential. Keep in sync with
// assistantCredentialRules in internal/httpapi/assistant_run_view.go.
export const CREDENTIAL_GUIDES = {
  gitSshKey: {
    steps: [
      "Add the dedicated public key to your Git host account and grant repository write access if needed.",
      "Under Personal settings → Git SSH keys, add a passphrase-free private key for this host. Repositories on this host share the key. Ask your administrator to trust the SSH host.",
      "Return here and retry",
    ],
  },
  gitHttpCredentials: {
    steps: [
      "Create a least-privilege, repository-scoped access token on your Git host.",
      "Under Personal settings → Git access tokens, add a token for this HTTPS host and enable “Provide to workspace”.",
      "Return here and retry",
    ],
  },
  gitToken: {
    url: "/#/settings",
    link: "Connect GitHub",
    steps: [
      "In personal settings, click Connect GitHub. Copy the device code and authorize the connection on GitHub.",
      "When adding a repository, choose Select my GitHub repository and select the repository and main branch.",
      "If GitHub authorization is unavailable, enter a PAT with read/write access to Contents and Pull requests.",
      "Return here and click Retry step",
    ],
  },
  codeBuddyApiKey: {
    url: CODEBUDDY_ENVIRONMENTS[0].keyUrl,
    link: "Create a CodeBuddy key",
    steps: [
      "Create and copy an API key on the site that hosts your CodeBuddy account (International, China or iOA).",
      "Under Personal settings → CodeBuddy API Key, choose the same site, paste the key and save. Third-party model keys such as DeepSeek are unsupported here.",
      "Return here and click Retry step",
    ],
  },
  codexApiKey: {
    steps: [
      "Under Personal settings → Codex API Key, enter and save the key and optional base URL, or switch the runner back to local login.",
      "Return here and click Retry step",
    ],
  },
  claudeCodeApiKey: {
    steps: [
      "Under Personal settings → Claude Code API Key, enter and save the key and optional base URL, or switch the runner back to local login.",
      "Return here and click Retry step",
    ],
  },
};

// credentialGuide points the CodeBuddy link at the key page of the edition
// the credential owner has selected.
export function credentialGuide(field, owner) {
  const guide = CREDENTIAL_GUIDES[field];
  if (!guide || field !== "codeBuddyApiKey") return guide || null;
  const env =
    codeBuddyEnvironmentIntent(owner?.codeBuddyInternetEnvironment) ||
    CODEBUDDY_ENVIRONMENTS[0];
  return { ...guide, url: env.keyUrl, link: `Open CodeBuddy ${env.label}Create key` };
}

const RULES = [
  ["codexApiKey", /Codex[^。\n]{0,16}API Key/i],
  ["claudeCodeApiKey", /Claude Code[^。\n]{0,16}API Key/i],
  [
    "codeBuddyApiKey",
    /CodeBuddy[^。\n]{0,20}(API Key|Key|凭据)|拒绝了你的 API Key/i,
  ],
  [
    "gitSshKey",
    /Git SSH (?:密钥|私钥)/i,
  ],
  [
    "gitToken",
    /Git Token|工蜂[^。\n]{0,12}令牌|could not read Username|Authentication failed|HTTP Basic: Access denied|terminal prompts disabled|requested URL returned error: 40[13]/i,
  ],
];

// credentialHint recognizes errors caused by a missing or rejected personal
// credential. owner is true when the message says the credential belongs to
// the responsible user (SOP runs use their credentials, not the viewer's).
export function credentialHint(text) {
  const message = String(text || "");
  if (!message) return null;
  for (const [field, rule] of RULES)
    if (rule.test(message))
      return {
        field,
        label: CREDENTIALS[field],
        owner: /责任人|Owner|该账号/i.test(message),
      };
  return null;
}

export function openCredentialSettings(field, sshRemote) {
  const credential = CREDENTIALS[field] ? field : "";
  if (window.parent !== window)
    window.parent.postMessage(
      { type: "agentflow-chat-open-view", view: "settings", credential, ...(credential === "gitSshKey" && sshRemote ? { sshRemote } : {}) },
      location.origin,
    );
  else location.href = "/#/settings";
}
