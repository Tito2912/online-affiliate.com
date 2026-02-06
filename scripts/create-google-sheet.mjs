import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function loadDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;

      let key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (key.startsWith("export ")) key = key.slice("export ".length).trim();

      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) value = value.slice(1, -1);

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing .env
  }
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(key) {
  return String(key || "").replace(/\\n/g, "\n");
}

async function getGoogleAccessToken({ clientEmail, privateKey, scopes }) {
  const now = Date.now();
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(privateKey));
  const jwt = `${unsigned}.${base64url(signature)}`;

  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("assertion", jwt);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error_description || data?.error || "Google OAuth error";
    throw new Error(`Google OAuth: ${msg}`);
  }

  const accessToken = String(data.access_token || "");
  if (!accessToken) throw new Error("Google OAuth: access_token manquant");
  return accessToken;
}

async function requestJson(url, { method, accessToken, body }) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message || data?.error_description || data?.error || res.statusText || "Request error";
    throw new Error(`${method} ${url} failed (${res.status}): ${msg}`);
  }
  return data;
}

function colToA1(colIndex1) {
  let n = colIndex1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function createSpreadsheetFileViaDrive({ title, folderId, accessToken }) {
  const url = "https://www.googleapis.com/drive/v3/files?fields=id,webViewLink";
  const body = {
    name: title,
    mimeType: "application/vnd.google-apps.spreadsheet",
  };
  if (folderId) body.parents = [folderId];

  const data = await requestJson(url, {
    method: "POST",
    accessToken,
    body,
  });

  return {
    id: String(data?.id || ""),
    url: String(data?.webViewLink || ""),
  };
}

async function getSpreadsheetSheets({ spreadsheetId, accessToken }) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=sheets(properties(sheetId,title))`;

  const data = await requestJson(url, { method: "GET", accessToken });
  return Array.isArray(data?.sheets) ? data.sheets : [];
}

async function renameFirstSheetIfNeeded({ spreadsheetId, accessToken, desiredTitle }) {
  const sheets = await getSpreadsheetSheets({ spreadsheetId, accessToken });
  const first = sheets?.[0]?.properties;
  const sheetId = first?.sheetId;
  const currentTitle = String(first?.title || "");

  if (!Number.isFinite(sheetId)) return;
  if (!desiredTitle || currentTitle === desiredTitle) return;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}:batchUpdate`;

  await requestJson(url, {
    method: "POST",
    accessToken,
    body: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, title: desiredTitle },
            fields: "title",
          },
        },
      ],
    },
  });
}

async function setHeaderRow({ spreadsheetId, sheetName, accessToken, header }) {
  const endCol = colToA1(header.length);
  const range = encodeURIComponent(`${sheetName}!A1:${endCol}1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${range}?valueInputOption=RAW`;

  await requestJson(url, {
    method: "PUT",
    accessToken,
    body: {
      range: `${sheetName}!A1`,
      majorDimension: "ROWS",
      values: [header],
    },
  });
}

async function shareSpreadsheet({ spreadsheetId, accessToken, emails }) {
  for (const email of emails) {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      spreadsheetId
    )}/permissions?sendNotificationEmail=false`;

    await requestJson(url, {
      method: "POST",
      accessToken,
      body: {
        type: "user",
        role: "writer",
        emailAddress: email,
      },
    });
  }
}

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variable manquante: ${name}`);
  return value;
}

function isProbablyServiceAccountJson(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (obj.type !== "service_account") return false;
  if (!obj.client_email || !obj.private_key) return false;
  return true;
}

function tryLoadServiceAccountFromJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isProbablyServiceAccountJson(parsed)) return null;
    return {
      clientEmail: String(parsed.client_email || "").trim(),
      privateKey: String(parsed.private_key || ""),
    };
  } catch {
    return null;
  }
}

function resolveServiceAccountJsonPath() {
  const envPath = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (envPath) return envPath;

  // Common default name (recommended)
  const defaultName = "google-service-account.json";
  const defaultPath = path.join(process.cwd(), defaultName);
  if (fs.existsSync(defaultPath)) return defaultName;

  // Auto-detect in project root: any .json (excluding package*.json) that looks like a service account key.
  try {
    const entries = fs.readdirSync(process.cwd(), { withFileTypes: true });
    const candidates = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => name.toLowerCase().endsWith(".json"))
      .filter((name) => !name.toLowerCase().startsWith("package"));

    const matches = [];
    for (const filename of candidates) {
      const abs = path.join(process.cwd(), filename);
      const creds = tryLoadServiceAccountFromJsonFile(abs);
      if (creds) matches.push(filename);
    }

    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new Error(
        `Plusieurs fichiers JSON possibles: ${matches.join(
          ", "
        )}. Mets le bon chemin dans GOOGLE_SERVICE_ACCOUNT_JSON.`
      );
    }
  } catch (err) {
    if (err?.message) throw err;
  }

  return "";
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("fetch n’est pas disponible. Utilise Node.js 18+.");
  }

  loadDotEnv(path.join(process.cwd(), ".env"));

  let clientEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  let privateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();

  if (!clientEmail || !privateKey) {
    const jsonPath = resolveServiceAccountJsonPath();
    if (!jsonPath) {
      throw new Error(
        "Service Account manquant. Ajoute GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY dans .env, ou mets un fichier google-service-account.json (ou définis GOOGLE_SERVICE_ACCOUNT_JSON)."
      );
    }

    const creds = tryLoadServiceAccountFromJsonFile(path.resolve(process.cwd(), jsonPath));
    if (!creds?.clientEmail || !creds?.privateKey) {
      throw new Error(
        `Le fichier ${jsonPath} ne ressemble pas à une clé Service Account valide (type=service_account).`
      );
    }

    clientEmail = creds.clientEmail;
    privateKey = creds.privateKey;
  }

  const sheetName = String(process.env.GOOGLE_SHEETS_TAB || "Orders").trim() || "Orders";
  const title = String(process.env.GOOGLE_SHEETS_TITLE || "online-affiliate.com Orders").trim();

  const shareWithRaw = String(process.env.GOOGLE_SHEETS_SHARE_WITH || "").trim();
  const shareWith = shareWithRaw
    ? shareWithRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"];

  const accessToken = await getGoogleAccessToken({
    clientEmail,
    privateKey,
    scopes,
  });

  const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
  const created = await createSpreadsheetFileViaDrive({ title, folderId, accessToken });
  const spreadsheetId = created.id;
  const spreadsheetUrl =
    created.url || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : "");
  if (!spreadsheetId) throw new Error("Google Sheets: spreadsheetId manquant");

  const header = [
    "stripe_session_id",
    "payment_intent",
    "livemode",
    "payment_status",
    "amount_total",
    "currency",
    "order_created_at",
    "customer_first_name",
    "customer_last_name",
    "customer_email",
    "customer_phone",
    "adresse_l1",
    "adresse_l2",
    "code_postal",
    "ville",
    "pays",
    "date_naissance",
    "lieu_naissance_ville",
    "lieu_naissance_pays",
    "societe",
    "siret",
    "niche",
    "delai_estime",
    "nombre_langues",
    "langues",
    "aff_extra",
    "content_pack",
    "mensuel",
    "checks",
    "total_one_shot",
    "total_monthly",
    "recap",
    "config_json",
    "order_json",
    "stripe_dashboard_url",
    "received_at",
    "notification_sent_at",
  ];

  // The file is created with a default tab name (e.g. "Sheet1"). Rename it to the desired tab.
  await renameFirstSheetIfNeeded({
    spreadsheetId,
    accessToken,
    desiredTitle: sheetName,
  });

  await setHeaderRow({ spreadsheetId, sheetName, accessToken, header });

  // Output (no secrets)
  process.stdout.write("Google Sheet créé.\n");
  if (spreadsheetUrl) process.stdout.write(`${spreadsheetUrl}\n`);
  process.stdout.write("\nÀ mettre dans Netlify:\n");
  process.stdout.write(`GOOGLE_SHEETS_ID=${spreadsheetId}\n`);
  process.stdout.write(`GOOGLE_SHEETS_TAB=${sheetName}\n`);

  if (shareWith.length > 0) {
    try {
      await shareSpreadsheet({ spreadsheetId, accessToken, emails: shareWith });
      process.stdout.write(`Partagé avec: ${shareWith.join(", ")}\n`);
    } catch (err) {
      process.stderr.write(
        `\nImpossible de partager automatiquement (Drive API). Active "Google Drive API" ou partage manuellement le fichier depuis ton Drive.\n`
      );
      process.stderr.write(`${String(err?.message || err || "Erreur inconnue")}\n`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  process.stderr.write(`${String(err?.message || err || "Erreur inconnue")}\n`);
  process.exitCode = 1;
});
