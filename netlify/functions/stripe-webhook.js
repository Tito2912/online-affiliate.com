const crypto = require("crypto");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function getRawBody(event) {
  const raw = event?.body || "";
  if (event?.isBase64Encoded) return Buffer.from(raw, "base64");
  return Buffer.from(raw, "utf8");
}

function parseStripeSignatureHeader(header) {
  const parts = String(header || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let timestamp = null;
  const v1 = [];

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === "t") {
      const n = Number.parseInt(value, 10);
      if (!Number.isNaN(n)) timestamp = n;
    }
    if (key === "v1") v1.push(value);
  }

  return { timestamp, v1 };
}

function timingSafeEqualHex(aHex, bHex) {
  try {
    const a = Buffer.from(String(aHex || ""), "hex");
    const b = Buffer.from(String(bHex || ""), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifyStripeSignature({ secret, signatureHeader, payload, toleranceSec = 300 }) {
  if (!secret) return { ok: false, reason: "missing_secret" };

  const { timestamp, v1 } = parseStripeSignatureHeader(signatureHeader);
  if (!timestamp || v1.length === 0) return { ok: false, reason: "bad_header" };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSec) return { ok: false, reason: "timestamp_out_of_tolerance" };

  const signed = `${timestamp}.${payload.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(signed, "utf8").digest("hex");

  for (const sig of v1) {
    if (timingSafeEqualHex(sig, expected)) return { ok: true };
  }

  return { ok: false, reason: "no_match" };
}

function extractOrderFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;

  const chunkCount = Number.parseInt(String(metadata.order_chunks || ""), 10);
  const chunks = [];

  if (Number.isFinite(chunkCount) && chunkCount > 0) {
    for (let i = 1; i <= chunkCount; i += 1) {
      const key = `order_b64_${String(i).padStart(2, "0")}`;
      const part = metadata[key];
      if (!part) return null;
      chunks.push(String(part));
    }
  } else {
    const keys = Object.keys(metadata)
      .filter((k) => /^order_b64_\d+$/i.test(k))
      .sort();
    for (const k of keys) chunks.push(String(metadata[k] || ""));
  }

  const b64 = chunks.join("");
  if (!b64) return null;

  try {
    const jsonStr = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

let googleTokenCache = {
  accessToken: "",
  expiresAtMs: 0,
};

function normalizePrivateKey(key) {
  return String(key || "").replace(/\\n/g, "\n");
}

async function getGoogleAccessToken({ clientEmail, privateKey, scopes }) {
  const now = Date.now();
  if (googleTokenCache.accessToken && googleTokenCache.expiresAtMs > now + 30_000) {
    return googleTokenCache.accessToken;
  }

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
  const expiresIn = Number(data.expires_in || 3600);
  if (!accessToken) throw new Error("Google OAuth: access_token manquant");

  googleTokenCache = {
    accessToken,
    expiresAtMs: now + expiresIn * 1000,
  };

  return accessToken;
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

async function sheetsRequest({ method, sheetId, range, accessToken, query, body, action }) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`;
  // IMPORTANT: Google APIs use `:{action}` in the *path* (e.g. `.../values/{range}:append`).
  // The `:` before the action MUST NOT be URL-encoded.
  const withAction = action ? `${base}:${action}` : base;
  const url = query ? `${withAction}?${query}` : withAction;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text().catch(() => "");
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const code = data?.error?.code || res.status;
    const msg =
      data?.error?.message ||
      data?.error?.status ||
      (text ? text.slice(0, 500) : "") ||
      res.statusText ||
      "Google Sheets API error";

    let hint = "";
    if (code === 403) hint = " (vérifie le partage du Sheet au service account + l’API Sheets activée)";
    if (code === 404) hint = " (vérifie GOOGLE_SHEETS_ID)";

    throw new Error(`Google Sheets API (${res.status}) ${method} ${range}: ${msg}${hint}`);
  }

  return data;
}

async function ensureSheetHeader({ sheetId, sheetName, accessToken, header }) {
  const endCol = colToA1(header.length);
  const headerRange = `${sheetName}!A1:${endCol}1`;

  const current = await sheetsRequest({
    method: "GET",
    sheetId,
    range: headerRange,
    accessToken,
  });

  const values = Array.isArray(current?.values) ? current.values : [];
  if (values.length > 0 && Array.isArray(values[0]) && values[0].some((v) => String(v || "").trim())) {
    return;
  }

  await sheetsRequest({
    method: "PUT",
    sheetId,
    range: `${sheetName}!A1`,
    accessToken,
    query: "valueInputOption=RAW",
    body: {
      range: `${sheetName}!A1`,
      majorDimension: "ROWS",
      values: [header],
    },
  });
}

async function findSessionRowIndex({ sheetId, sheetName, accessToken, sessionId }) {
  const col = await sheetsRequest({
    method: "GET",
    sheetId,
    range: `${sheetName}!A:A`,
    accessToken,
  });

  const values = Array.isArray(col?.values) ? col.values : [];
  for (let i = 0; i < values.length; i += 1) {
    const v = Array.isArray(values[i]) ? String(values[i][0] || "") : "";
    if (v === sessionId) return i + 1; // 1-based row index
  }
  return 0;
}

async function getSheetCellValue({ sheetId, accessToken, a1Range }) {
  const data = await sheetsRequest({
    method: "GET",
    sheetId,
    range: a1Range,
    accessToken,
  });

  const values = Array.isArray(data?.values) ? data.values : [];
  return values?.[0]?.[0] ? String(values[0][0]) : "";
}

async function updateSheetCell({ sheetId, accessToken, a1Range, value }) {
  await sheetsRequest({
    method: "PUT",
    sheetId,
    range: a1Range,
    accessToken,
    query: "valueInputOption=RAW",
    body: {
      range: a1Range,
      majorDimension: "ROWS",
      values: [[value]],
    },
  });
}

function parseRowIndexFromUpdatedRange(updatedRange) {
  const m = String(updatedRange || "").match(/![A-Z]+(\d+):/);
  if (!m) return 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
}

async function appendSheetRow({ sheetId, sheetName, accessToken, row }) {
  const endCol = colToA1(row.length);
  const range = `${sheetName}!A:${endCol}`;

  return sheetsRequest({
    method: "POST",
    sheetId,
    range,
    action: "append",
    accessToken,
    query: "valueInputOption=RAW&insertDataOption=INSERT_ROWS",
    body: { majorDimension: "ROWS", values: [row] },
  });
}

function getStripeDashboardUrl({ livemode, sessionId, paymentIntent }) {
  const base = livemode ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test";
  if (paymentIntent) return `${base}/payments/${paymentIntent}`;
  return `${base}/checkout/sessions/${sessionId}`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

function eurFromCents(amountTotal, currency) {
  const cents = Number(amountTotal ?? NaN);
  if (!Number.isFinite(cents)) return "";

  const cur = String(currency || "").toLowerCase();
  // Stripe provides `amount_total` in the smallest currency unit.
  // For EUR it's cents, so convert to euros for the sheet.
  // (If you ever switch currency, adjust this.)
  if (cur && cur !== "eur") return cents;

  return Number((cents / 100).toFixed(2));
}

function moneyFromCents(amountTotal, currency) {
  const cents = Number(amountTotal || 0);
  const cur = String(currency || "").toUpperCase();
  if (!Number.isFinite(cents) || cents <= 0) return "";
  return `${(cents / 100).toFixed(2)} ${cur}`;
}

async function sendNotification({ session, order, message }) {
  const webhookUrl = String(process.env.ORDER_NOTIFICATION_WEBHOOK_URL || "").trim();
  if (!webhookUrl) return;

  const payload = {
    text: message,
    content: message,
    session_id: session?.id || "",
    payment_intent: session?.payment_intent || "",
    livemode: Boolean(session?.livemode),
    customer_email: order?.customer?.email || "",
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Notification webhook failed (${res.status}): ${txt.slice(0, 300)}`);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return json(500, { error: "STRIPE_WEBHOOK_SECRET manquant." });

    const signatureHeader =
      event.headers?.["stripe-signature"] ||
      event.headers?.["Stripe-Signature"] ||
      event.headers?.["STRIPE-SIGNATURE"] ||
      "";

    const payload = getRawBody(event);

    const verification = verifyStripeSignature({
      secret: webhookSecret,
      signatureHeader,
      payload,
    });

    if (!verification.ok) {
      return json(400, { error: "Invalid Stripe signature", reason: verification.reason });
    }

    let stripeEvent;
    try {
      stripeEvent = JSON.parse(payload.toString("utf8"));
    } catch {
      return json(400, { error: "Invalid JSON payload" });
    }

    const type = String(stripeEvent?.type || "");
    const allowed = new Set([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ]);

    if (!allowed.has(type)) {
      return json(200, { received: true, ignored: true, type });
    }

    const session = stripeEvent?.data?.object || {};
    const paymentStatus = String(session.payment_status || "");
    if (paymentStatus && paymentStatus !== "paid") {
      return json(200, { received: true, ignored: true, payment_status: paymentStatus });
    }

    const sessionId = String(session.id || "");
    if (!sessionId) return json(200, { received: true, ignored: true, reason: "missing_session_id" });

    const metadata = session.metadata || {};
    const order = extractOrderFromMetadata(metadata);

    const sheetId = String(process.env.GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEET_ID || "").trim();
    const sheetName = String(process.env.GOOGLE_SHEETS_TAB || "Orders").trim();
    const googleEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
    const googleKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();

    const wantsSheetsConfig = Boolean(sheetId || googleEmail || googleKey);
    const sheetsReady = Boolean(sheetId && sheetName && googleEmail && googleKey);
    if (wantsSheetsConfig && !sheetsReady) {
      throw new Error(
        "Google Sheets: variables d’environnement incomplètes (GOOGLE_SHEETS_ID/TAB + GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY)."
      );
    }

    const dashboardUrl = getStripeDashboardUrl({
      livemode: Boolean(session.livemode),
      sessionId,
      paymentIntent: session.payment_intent,
    });

    const checksSelected = (() => {
      const checks = order?.config?.checks;
      if (!checks || typeof checks !== "object") return "";
      return Object.entries(checks)
        .filter(([, v]) => Boolean(v))
        .map(([k]) => k)
        .join(",");
    })();

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

    const receivedAt = new Date().toISOString();

    const row = [
      sessionId,
      String(session.payment_intent || ""),
      String(Boolean(session.livemode)),
      String(session.payment_status || ""),
      eurFromCents(session.amount_total, session.currency),
      String(session.currency || "").toUpperCase(),
      String(order?.createdAt || ""),
      String(order?.customer?.firstName || ""),
      String(order?.customer?.lastName || ""),
      String(order?.customer?.email || ""),
      String(order?.customer?.phone || ""),
      String(order?.customer?.address?.line1 || ""),
      String(order?.customer?.address?.line2 || ""),
      String(order?.customer?.address?.postalCode || ""),
      String(order?.customer?.address?.city || ""),
      String(order?.customer?.address?.country || ""),
      String(order?.customer?.birth?.date || ""),
      String(order?.customer?.birth?.city || ""),
      String(order?.customer?.birth?.country || ""),
      String(order?.customer?.company?.name || ""),
      String(order?.customer?.company?.siret || ""),
      String(order?.project?.niche || ""),
      String(order?.project?.delai_estime || order?.project?.delaiEstime || order?.project?.delai || ""),
      String(order?.config?.langCount ?? ""),
      Array.isArray(order?.config?.langs) ? order.config.langs.join(",") : "",
      String(order?.config?.affExtra ?? ""),
      String(order?.config?.contentPack ?? ""),
      String(order?.config?.monthly ?? ""),
      checksSelected,
      String(order?.totals?.oneShot ?? ""),
      String(order?.totals?.monthly ?? ""),
      String(order?.recap || ""),
      safeJson(order?.config || {}),
      safeJson(order || null),
      dashboardUrl,
      receivedAt,
      "", // notification_sent_at
    ];

    const label = session.livemode ? "LIVE" : "TEST";
    const amountLabel = moneyFromCents(session.amount_total, session.currency);
    const customerLabel = order?.customer?.name
      ? `${order.customer.name} <${order?.customer?.email || ""}>`
      : String(order?.customer?.email || "");

    const msgLines = [
      `Nouvelle commande payée (${label}) — ${amountLabel}`.trim(),
      customerLabel ? `Client: ${customerLabel}` : "",
      order?.project?.niche ? `Niche: ${order.project.niche}` : "",
      Array.isArray(order?.config?.langs) ? `Langues: ${order.config.langs.join(", ")}` : "",
      checksSelected ? `Options: ${checksSelected}` : "",
      `Stripe: ${dashboardUrl}`,
    ].filter(Boolean);
    const message = msgLines.join("\n");

    const notificationUrlConfigured = Boolean(String(process.env.ORDER_NOTIFICATION_WEBHOOK_URL || "").trim());

    let accessToken = "";
    let rowIndex = 0;
    const notificationCol = colToA1(header.length); // last column

    if (sheetsReady) {
      accessToken = await getGoogleAccessToken({
        clientEmail: googleEmail,
        privateKey: googleKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const autoHeader = String(process.env.GOOGLE_SHEETS_AUTO_HEADER || "true").toLowerCase() !== "false";
      if (autoHeader) {
        await ensureSheetHeader({ sheetId, sheetName, accessToken, header });
      }

      const dedupe = String(process.env.GOOGLE_SHEETS_DEDUP || "true").toLowerCase() !== "false";
      if (dedupe) {
        rowIndex = await findSessionRowIndex({ sheetId, sheetName, accessToken, sessionId });
      }

      if (!rowIndex) {
        const appendRes = await appendSheetRow({ sheetId, sheetName, accessToken, row });
        const updatedRange = appendRes?.updates?.updatedRange;
        rowIndex = parseRowIndexFromUpdatedRange(updatedRange);
      }
    }

    // Notification: idempotent when Sheets is enabled (stored in notification_sent_at).
    if (notificationUrlConfigured) {
      let alreadyNotified = false;

      if (sheetsReady && rowIndex) {
        const a1 = `${sheetName}!${notificationCol}${rowIndex}`;
        const current = await getSheetCellValue({ sheetId, accessToken, a1Range: a1 });
        alreadyNotified = Boolean(String(current || "").trim());
      }

      if (!alreadyNotified) {
        try {
          await sendNotification({ session, order, message });
          if (sheetsReady && rowIndex) {
            const a1 = `${sheetName}!${notificationCol}${rowIndex}`;
            await updateSheetCell({ sheetId, accessToken, a1Range: a1, value: new Date().toISOString() });
          }
        } catch (err) {
          // Ne bloque pas le webhook Stripe sur une notification.
          // La commande est quand même enregistrée dans le Sheet si configuré.
          // eslint-disable-next-line no-console
          console.error(err?.stack || String(err));
        }
      }
    }

    return json(200, { received: true, ok: true, session_id: sessionId });
  } catch (err) {
    return json(500, { error: String(err?.message || err || "Erreur inconnue.") });
  }
};
