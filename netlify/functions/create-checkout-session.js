function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function getBaseUrl(headers) {
  const proto = headers["x-forwarded-proto"] || "https";
  const host = headers["x-forwarded-host"] || headers.host;
  return `${proto}://${host}`;
}

function clampInt(value, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function getContentPagesPerLang(contentPackPrice) {
  const price = Number(contentPackPrice || 0);
  if (price === 150) return 1;
  if (price === 490) return 5;
  if (price === 990) return 10;
  if (price === 1890) return 20;
  return 1;
}

function calcTotals(order) {
  const checks = order?.config?.checks || {};
  const langCount = clampInt(order?.config?.langCount ?? 1, 1, 8);
  const langs = Array.isArray(order?.config?.langs) ? order.config.langs.map((s) => String(s)).filter(Boolean) : [];
  const monthly = Number(order?.config?.monthly || 0);

  const allowedLangs = new Set([
    "fr",
    "en",
    "es",
    "pt-PT",
    "pt-BR",
    "de",
    "it",
    "nl",
    "pl",
  ]);

  const allowedMonthly = new Set([0, 49, 249]);
  if (!allowedMonthly.has(monthly)) throw new Error("Option mensuelle invalide.");

  if (langs.length !== langCount) {
    throw new Error(`Langues invalides : ${langs.length} sélectionnées, ${langCount} attendue(s).`);
  }

  const unique = new Set(langs);
  if (unique.size !== langs.length) {
    throw new Error("Langues invalides : doublons.");
  }
  for (const lang of langs) {
    if (!allowedLangs.has(lang)) throw new Error(`Langue non supportée : ${lang}`);
  }

  const contentPack = Number(order?.config?.contentPack || 150);
  const allowedContent = new Set([150, 490, 990, 1890]);
  if (!allowedContent.has(contentPack)) throw new Error("Pack contenu invalide.");

  const pagesPerLang = getContentPagesPerLang(contentPack);
  const pagesLabel = pagesPerLang === 1 ? "1 page" : `${pagesPerLang} pages`;

  const items = [];

  // Fondations (obligatoire)
  items.push({ label: "Fondations (site + tracking + pages + branding + logo)", amount: 860 });

  const optionPrices = [
    { key: "programme_affilie_1", label: "Programme affilié #1", amount: 190 },
    { key: "performance", label: "Performance (cache + images + réglages core)", amount: 190 },
    { key: "branding_premium", label: "Branding premium (direction artistique + UI plus poussée)", amount: 490 },
  ];

  for (const opt of optionPrices) {
    if (checks[opt.key]) items.push({ label: opt.label, amount: opt.amount });
  }

  if (checks.seo_silos) {
    const amount = pagesPerLang >= 20 ? 490 : pagesPerLang >= 10 ? 390 : 290;
    items.push({ label: `Architecture SEO (silos + plan de maillage) — palier ${pagesLabel}`, amount });
  }

  if (checks.schema) {
    const amount = pagesPerLang >= 20 ? 290 : pagesPerLang >= 10 ? 240 : 190;
    items.push({ label: `Schema (FAQ/Review — selon gabarits) — palier ${pagesLabel}`, amount });
  }

  const hasAff1 = Boolean(checks.programme_affilie_1);
  const affExtra = clampInt(order?.config?.affExtra ?? 0, 0, 20);
  if (hasAff1 && affExtra > 0) {
    items.push({ label: `Programme affilié supplémentaire ×${affExtra}`, amount: affExtra * 150 });
  }

  if (langCount > 1) {
    const extra = (langCount - 1) * 490;
    items.push({ label: `Option multi-langue (+${langCount - 1} langue(s))`, amount: extra });
  }

  if (contentPack > 0) {
    items.push({
      label: langCount > 1 ? `Pack contenu (${contentPack}€) ×${langCount} langue(s)` : `Pack contenu (${contentPack}€)`,
      amount: contentPack * langCount,
    });
  }

  const oneShot = items.reduce((sum, it) => sum + it.amount, 0);
  return { items, oneShot, monthly, langCount, langs };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return json(500, { error: "STRIPE_SECRET_KEY manquant (variable d’environnement Netlify)." });

    const order = JSON.parse(event.body || "null");
    if (!order || !order.customer) return json(400, { error: "Commande invalide." });

    const email = String(order.customer.email || "").trim();
    const name = String(order.customer.name || "").trim();
    if (!email || !email.includes("@")) return json(400, { error: "Email invalide." });

    const niche = String(order?.project?.niche || "").trim();
    const delaiEstime = String(order?.project?.delai_estime || order?.project?.delaiEstime || order?.project?.delai || "").trim();

    const { oneShot, monthly, langCount, langs } = calcTotals(order);
    const amountCents = Math.round(oneShot * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return json(400, { error: "Montant invalide." });

    const baseUrl = getBaseUrl(event.headers || {});

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", `${baseUrl}/merci/?session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", `${baseUrl}/paiement/annule/`);
    params.set("customer_email", email);

    params.set("line_items[0][price_data][currency]", "eur");
    params.set("line_items[0][price_data][product_data][name]", "E-Com Shop — Machine d’affiliation (pack configuré)");
    params.set("line_items[0][price_data][unit_amount]", String(amountCents));
    params.set("line_items[0][quantity]", "1");

    params.set("metadata[source]", "online-affiliate.com");
    if (name) params.set("metadata[customer_name]", name);
    if (niche) params.set("metadata[niche]", niche);
    if (delaiEstime) params.set("metadata[delai_estime]", delaiEstime.slice(0, 200));
    params.set("metadata[langues]", langs.join(","));
    params.set("metadata[nombre_langues]", String(langCount));
    params.set("metadata[mensuel_selectionne]", String(monthly));

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const message = data?.error?.message || "Erreur Stripe.";
      return json(502, { error: message });
    }

    if (!data.url) return json(502, { error: "Stripe: URL de checkout manquante." });
    return json(200, { url: data.url });
  } catch (err) {
    return json(500, { error: String(err?.message || err || "Erreur inconnue.") });
  }
};
