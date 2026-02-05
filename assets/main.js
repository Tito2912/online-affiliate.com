import { injectLayout } from './layout.js';
import { setupHeroBackground } from './hero-background.js';

// Determine the current page path for active link highlighting
const currentPage = window.location.pathname;
injectLayout(currentPage);


function moneyEUR(amount) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

function euroShort(amount) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)}€`;
}

function clampInt(value, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function buildRecap(lines, totalOneShot, monthly) {
  const parts = [];
  parts.push("Récap pack");
  for (const line of lines) {
    if (line.price > 0) parts.push(`- ${line.label} : ${moneyEUR(line.price)}`);
    else parts.push(`- ${line.label}`);
  }
  parts.push("");
  parts.push(`Total one-shot : ${moneyEUR(totalOneShot)}`);
  parts.push(`Mensuel : ${moneyEUR(monthly)} / mois`);
  return parts.join("\n");
}

function setupNav() {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");
  if (!toggle || !nav) return;

  function setOpen(nextOpen) {
    nav.dataset.open = nextOpen ? "true" : "false";
    toggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  }

  function isOpen() {
    return nav.dataset.open === "true";
  }

  toggle.addEventListener("click", () => setOpen(!isOpen()));

  nav.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    setOpen(false);
  });

  document.addEventListener("click", (e) => {
    if (!isOpen()) return;
    if (e.target.closest("#siteNav")) return;
    if (e.target.closest("#navToggle")) return;
    setOpen(false);
  });

  setOpen(false);
}

function setupConfigurator(root) {
  const linesEl = document.getElementById("cfgLines");
  const totalEl = document.getElementById("cfgTotal");
  const monthlyEl = document.getElementById("cfgMonthly");
  const copyBtn = document.getElementById("cfgCopy");

  const totalOneShotField = document.getElementById("totalOneShotField");
  const totalMonthlyField = document.getElementById("totalMonthlyField");
  const recapField = document.getElementById("recapField");
  const langCountField = document.getElementById("langCountField");
  const langsSelectedField = document.getElementById("langsSelectedField");

  const submitBtn = document.getElementById("submitBtn");
  const opsConsent = document.getElementById("opsConsent");
  const estimatedDelayInput = document.getElementById("estimatedDelay");

  const langCountInput = document.getElementById("langCount");
  const langHint = document.getElementById("langHint");
  const langPanel = document.getElementById("langPanel");
  const langSummaryText = document.getElementById("langSummaryText");

  const LANG_CHOICES = [
    { value: "fr", label: "Français (FR)" },
    { value: "en", label: "English (EN)" },
    { value: "es", label: "Español (ES)" },
    { value: "pt-PT", label: "Português (PT)" },
    { value: "pt-BR", label: "Português (BR)" },
    { value: "de", label: "Deutsch (DE)" },
    { value: "it", label: "Italiano (IT)" },
    { value: "nl", label: "Nederlands (NL)" },
    { value: "pl", label: "Polski (PL)" },
  ];

  const aff1 = document.getElementById("aff1");
  const affExtraInput = document.getElementById("affExtra");
  const qtyButtons = Array.from(root.querySelectorAll(".qty-btn"));
  const nicheSelect = document.getElementById("nicheSelect");
  const nicheOtherWrap = document.getElementById("nicheOtherWrap");
  const nicheOtherInput = document.getElementById("nicheOther");

  function getCheckedCheckboxes() {
    return Array.from(root.querySelectorAll('input[type="checkbox"][data-price]'))
      .filter((input) => input.checked)
      .map((input) => ({
        label: input.dataset.label || "Option",
        price: Number(input.dataset.price || 0),
      }));
  }

  function getLangCount() {
    const max = langCountInput?.max ? Number(langCountInput.max) : 8;
    const safeMax = Number.isFinite(max) ? max : 8;
    return clampInt(langCountInput?.value ?? 1, 1, Math.max(1, safeMax));
  }

  function getLangOptionEls() {
    if (!langPanel) return [];
    return Array.from(langPanel.querySelectorAll('input[type="checkbox"][data-lang-opt]'));
  }

  function buildLangOptions() {
    if (!langPanel) return;
    if (langPanel.childElementCount > 0) return;

    for (const choice of LANG_CHOICES) {
      const label = document.createElement("label");
      label.className = "lang-opt";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = choice.value;
      input.setAttribute("data-lang-opt", "true");
      input.setAttribute("data-lang-label", choice.label);

      if (choice.value === "fr") input.checked = true;

      const text = document.createElement("span");
      text.textContent = choice.label;

      label.appendChild(input);
      label.appendChild(text);
      langPanel.appendChild(label);
    }
  }

  function getSelectedLangValues() {
    const opts = getLangOptionEls();
    const selected = opts.filter((o) => o.checked).map((o) => String(o.value || "").trim()).filter(Boolean);
    return selected.length ? selected : ["fr"];
  }

  function getSelectedLangLabels() {
    const opts = getLangOptionEls();
    const labels = opts
      .filter((o) => o.checked)
      .map((o) => o.dataset.langLabel || o.getAttribute("data-lang-label") || o.value || "Langue");
    return labels.length ? labels : ["Français (FR)"];
  }

  let lastLangChanged = null;

  function applyLanguageRules(changed) {
    buildLangOptions();
    if (!langCountInput) return;

    const count = getLangCount();
    langCountInput.value = String(count);

    const opts = getLangOptionEls();
    if (opts.length === 0) return;

    // Ensure at least one is selected.
    if (!opts.some((o) => o.checked)) {
      const fr = opts.find((o) => o.value === "fr") || opts[0];
      fr.checked = true;
    }

    // When count === 1, behave like radio (easy switching).
    if (count === 1 && changed && changed.checked) {
      for (const opt of opts) {
        if (opt !== changed) opt.checked = false;
      }
    }

    const selectedNow = opts.filter((o) => o.checked);
    if (selectedNow.length > count) {
      if (changed && changed.checked) {
        changed.checked = false;
      } else {
        for (let i = selectedNow.length - 1; i >= count; i--) selectedNow[i].checked = false;
      }
    }

    const selectedFinal = opts.filter((o) => o.checked);
    const disableOthers = count > 1 && selectedFinal.length >= count;
    for (const opt of opts) {
      if (!opt.checked) opt.disabled = disableOthers;
      else opt.disabled = false;
    }

    if (langSummaryText) {
      const labels = getSelectedLangLabels();
      langSummaryText.textContent = labels.join(", ");
    }

    if (langHint) {
      const plural = count > 1 ? "langues" : "langue";
      langHint.textContent = `Choisis ${count} ${plural}. Sélection actuelle : ${getSelectedLangLabels().join(", ")}. Packs de contenu = par langue. (Multi-langue = structure + hreflang + gabarits.)`;
    }
  }

  function getLanguagePricing() {
    const count = getLangCount();
    const extraCount = Math.max(0, count - 1);
    const extraUnit = 490;
    return {
      count,
      selected: getSelectedLangLabels(),
      extraCount,
      extraPrice: extraCount * extraUnit,
    };
  }

  function getContentPack() {
    const r = root.querySelector('input[name="contentPack"]:checked');
    if (!r) return { label: "Contenu: 1 page", price: 150 };
    return { label: r.dataset.label || "Contenu", price: Number(r.value || 0) };
  }

  function getMonthly() {
    const r = root.querySelector('input[name="monthly"]:checked');
    if (!r) return { label: "Mensuel: aucun", price: 0 };
    return { label: r.dataset.label || "Mensuel", price: Number(r.value || 0) };
  }

  function getChecksState() {
    const state = {};
    for (const input of root.querySelectorAll('input[type="checkbox"][data-price]')) {
      const name = input.getAttribute("name") || input.id || input.dataset.key;
      if (!name) continue;
      state[name] = Boolean(input.checked);
    }
    return state;
  }

  function getQueueDelayRangeDays() {
    const queueCount = clampInt(root.dataset.queue ?? 0, 0, 50);
    // Chaque demande en cours peut retarder le démarrage (valeur indicative).
    const minPerRequest = 2;
    const maxPerRequest = 4;
    return { queueCount, minDays: queueCount * minPerRequest, maxDays: queueCount * maxPerRequest };
  }

  function getContentPagesPerLang(contentPackPrice) {
    const price = Number(contentPackPrice || 0);
    if (price === 150) return 1;
    if (price === 490) return 5;
    if (price === 990) return 10;
    if (price === 1890) return 20;
    return 1;
  }

  function estimateDeliveryRange({ checks, affExtra, contentPackPrice, langCount }) {
    const baseMin = 7;
    const baseMax = 12;

    let min = baseMin;
    let max = baseMax;

    const queue = getQueueDelayRangeDays();
    min += queue.minDays;
    max += queue.maxDays;

    const safeLangCount = clampInt(langCount ?? 1, 1, 8);
    const extraLangs = Math.max(0, safeLangCount - 1);
    min += extraLangs * 1;
    max += extraLangs * 2;

    const pagesPerLang = getContentPagesPerLang(contentPackPrice);
    const totalPages = pagesPerLang * safeLangCount;
    min += totalPages * 0.35;
    max += totalPages * 0.65;

    if (checks?.programme_affilie_1) {
      min += 1;
      max += 2;
    }

    const extraPrograms = clampInt(affExtra ?? 0, 0, 20);
    if (checks?.programme_affilie_1 && extraPrograms > 0) {
      min += extraPrograms * 0.5;
      max += extraPrograms * 1;
    }

    if (checks?.seo_silos) {
      min += 1;
      max += 2;
    }
    if (checks?.performance) {
      min += 0.5;
      max += 1;
    }
    if (checks?.schema) {
      min += 0.5;
      max += 1;
    }
    if (checks?.branding_premium) {
      min += 1;
      max += 3;
    }

    const minDays = Math.max(baseMin, Math.ceil(min));
    const maxDays = Math.max(minDays, Math.ceil(max));
    return { minDays, maxDays };
  }

  function formatDeliveryRange(range) {
    if (!range) return "—";
    const minDays = Number(range.minDays || 0);
    const maxDays = Number(range.maxDays || 0);
    if (!Number.isFinite(minDays) || !Number.isFinite(maxDays) || minDays <= 0 || maxDays <= 0) return "—";
    if (minDays === maxDays) return `${minDays} jours ouvrés`;
    return `${minDays}–${maxDays} jours ouvrés`;
  }

  function applyTieredOptionPrices(pagesPerLang) {
    const safePages = clampInt(pagesPerLang ?? 1, 1, 20);
    const pagesLabel = safePages === 1 ? "1 page" : `${safePages} pages`;

    const seoInput = root.querySelector('input[type="checkbox"][name="seo_silos"]');
    if (seoInput) {
      const seoPrice = safePages >= 20 ? 490 : safePages >= 10 ? 390 : 290;
      seoInput.dataset.price = String(seoPrice);
      seoInput.dataset.label = `Architecture SEO (silos + plan de maillage) — palier ${pagesLabel}`;
      const strong = seoInput.closest(".cfg-row")?.querySelector("strong");
      if (strong) strong.textContent = euroShort(seoPrice);
    }

    const schemaInput = root.querySelector('input[type="checkbox"][name="schema"]');
    if (schemaInput) {
      const schemaPrice = safePages >= 20 ? 290 : safePages >= 10 ? 240 : 190;
      schemaInput.dataset.price = String(schemaPrice);
      schemaInput.dataset.label = `Schema (FAQ/Review — selon gabarits) — palier ${pagesLabel}`;
      const strong = schemaInput.closest(".cfg-row")?.querySelector("strong");
      if (strong) strong.textContent = euroShort(schemaPrice);
    }
  }

  function getAffExtra() {
    const unit = Number(affExtraInput?.dataset.unitPrice || 0);
    const qtyRaw = affExtraInput?.value || 0;
    const qty = clampInt(qtyRaw, 0, 20);
    if (affExtraInput) affExtraInput.value = String(qty);
    if (qty <= 0) return null;
    const labelBase = affExtraInput?.dataset.label || "Programme affilié supplémentaire";
    return { label: `${labelBase} ×${qty}`, price: qty * unit };
  }

  function applyBusinessRules() {
    const hasAff1 = Boolean(aff1?.checked);
    if (!hasAff1) {
      if (affExtraInput) affExtraInput.value = "0";
    }

    if (affExtraInput) affExtraInput.disabled = !hasAff1;
    for (const btn of qtyButtons) {
      if (btn.dataset.target === "affExtra") btn.disabled = !hasAff1;
    }
  }

  function updateSubmitState() {
    if (!submitBtn || !opsConsent) return;
    const ok = Boolean(opsConsent.checked);
    submitBtn.disabled = !ok;
    submitBtn.setAttribute("aria-disabled", ok ? "false" : "true");
  }

  function render() {
    applyBusinessRules();
    applyLanguageRules(lastLangChanged);
    lastLangChanged = null;

    const lang = getLanguagePricing();
    const content = getContentPack();
    applyTieredOptionPrices(getContentPagesPerLang(content.price));

    const lines = [];
    lines.push(...getCheckedCheckboxes());

    lines.push({ label: `Langues : ${lang.selected.join(", ")}`, price: 0, alwaysShow: true });
    if (lang.extraCount > 0) {
      const plural = lang.extraCount > 1 ? "langues" : "langue";
      lines.push({ label: `Option multi-langue (+${lang.extraCount} ${plural})`, price: lang.extraPrice });
    }

    const extra = getAffExtra();
    if (extra) lines.push(extra);

    if (content.price > 0) {
      const label = lang.count > 1 ? `${content.label} (×${lang.count} langues)` : content.label;
      lines.push({ label, price: content.price * lang.count });
    }

    const checksState = getChecksState();
    const estimate = estimateDeliveryRange({
      checks: checksState,
      affExtra: clampInt(affExtraInput?.value ?? 0, 0, 20),
      contentPackPrice: content.price,
      langCount: lang.count,
    });
    const estimatedDelayText = formatDeliveryRange(estimate);
    if (estimatedDelayInput) estimatedDelayInput.value = estimatedDelayText;

    const monthly = getMonthly();

    const totalOneShot = lines.reduce((sum, it) => sum + it.price, 0);

    if (linesEl) {
      linesEl.innerHTML =
        lines
          .filter((it) => it.price > 0 || it.alwaysShow || it.label.toLowerCase().includes("fondations"))
          .map((it) => {
            const price = it.price > 0 ? moneyEUR(it.price) : "—";
            return `<div class="line"><span>${it.label}</span><strong>${price}</strong></div>`;
          })
          .join("") || `<div class="muted">Aucune option sélectionnée.</div>`;
    }

    if (totalEl) totalEl.textContent = moneyEUR(totalOneShot);
    if (monthlyEl) monthlyEl.textContent = `${moneyEUR(monthly.price)} / mois`;

    if (totalOneShotField) totalOneShotField.value = String(totalOneShot);
    if (totalMonthlyField) totalMonthlyField.value = String(monthly.price);
    if (recapField) recapField.value = buildRecap(lines, totalOneShot, monthly.price);
    if (langCountField) langCountField.value = String(lang.count);
    if (langsSelectedField) langsSelectedField.value = lang.selected.join(", ");

    updateSubmitState();
  }

  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".qty-btn");
    if (!btn) return;
    const targetId = btn.dataset.target;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    const min = target.min ? Number(target.min) : 0;
    const max = target.max ? Number(target.max) : 20;
    const current = clampInt(target.value, min, max);
    const next = btn.dataset.action === "inc" ? current + 1 : current - 1;
    target.value = String(clampInt(next, min, max));
    render();
  });

  root.addEventListener("change", (e) => {
    if (e.target && e.target.matches && e.target.matches('input[type="checkbox"][data-lang-opt]')) {
      lastLangChanged = e.target;
    }
    render();
  });

  function updateNicheOtherVisibility() {
    if (!nicheSelect || !nicheOtherWrap) return;
    const isOther = String(nicheSelect.value || "") === "autre";
    nicheOtherWrap.hidden = !isOther;
    if (nicheOtherInput) {
      nicheOtherInput.required = isOther;
      if (!isOther) nicheOtherInput.value = "";
    }
  }

  nicheSelect?.addEventListener("change", updateNicheOtherVisibility);
  affExtraInput?.addEventListener("input", render);
  langCountInput?.addEventListener("input", render);

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(recapField?.value || "");
      copyBtn.textContent = "Copié";
      setTimeout(() => (copyBtn.textContent = "Copier le récap"), 1200);
    } catch {
      alert("Impossible de copier automatiquement. Tu peux sélectionner le texte puis copier.");
    }
  });

  root.addEventListener("submit", (e) => {
    render();

    if (opsConsent && !opsConsent.checked) {
      e.preventDefault();
      alert("Merci de cocher la case d’autorisation avant de passer au paiement.");
      return;
    }

    // Validate languages count before submission.
    const count = getLangCount();
    const langs = getSelectedLangValues();
    const unique = new Set(langs);
    if (langs.length !== count) {
      e.preventDefault();
      alert(`Choisis exactement ${count} langue(s) (actuellement : ${langs.length}).`);
      return;
    }
    if (unique.size !== langs.length) {
      e.preventDefault();
      alert("Merci de choisir des langues différentes (pas de doublons).");
      return;
    }

    updateNicheOtherVisibility();
    if (typeof root.reportValidity === "function" && !root.reportValidity()) {
      e.preventDefault();
      return;
    }

    const orderKey = "ecomshop_order_v1";
    const firstNameInput = root.querySelector('input[name="prenom"]');
    const lastNameInput = root.querySelector('input[name="nom"]');
    const emailInput = root.querySelector('input[name="email"]');
    const phoneInput = root.querySelector('input[name="telephone"]');
    const addr1Input = root.querySelector('input[name="adresse_l1"]');
    const addr2Input = root.querySelector('input[name="adresse_l2"]');
    const postalInput = root.querySelector('input[name="code_postal"]');
    const cityInput = root.querySelector('input[name="ville"]');
    const countryInput = root.querySelector('input[name="pays"]');
    const birthDateInput = root.querySelector('input[name="date_naissance"]');
    const birthCityInput = root.querySelector('input[name="lieu_naissance_ville"]');
    const birthCountryInput = root.querySelector('input[name="lieu_naissance_pays"]');
    const companyNameInput = root.querySelector('input[name="societe"]');
    const siretInput = root.querySelector('input[name="siret"]');

    const selectedNiche = String(nicheSelect?.value || "").trim();
    const nicheFinal = selectedNiche === "autre" ? String(nicheOtherInput?.value || "").trim() : selectedNiche;

    const checks = {};
    for (const input of root.querySelectorAll('input[type="checkbox"][data-price]')) {
      const name = input.getAttribute("name") || input.id || input.dataset.key;
      if (!name) continue;
      checks[name] = Boolean(input.checked);
    }

    const contentRadio = root.querySelector('input[type="radio"][name="contentPack"]:checked');
    const monthlyRadio = root.querySelector('input[type="radio"][name="monthly"]:checked');

    const firstName = String(firstNameInput?.value || "").trim();
    const lastName = String(lastNameInput?.value || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    const order = {
      createdAt: new Date().toISOString(),
      customer: {
        firstName,
        lastName,
        name: fullName,
        email: String(emailInput?.value || "").trim(),
        phone: String(phoneInput?.value || "").trim(),
        address: {
          line1: String(addr1Input?.value || "").trim(),
          line2: String(addr2Input?.value || "").trim(),
          postalCode: String(postalInput?.value || "").trim(),
          city: String(cityInput?.value || "").trim(),
          country: String(countryInput?.value || "").trim(),
        },
        birth: {
          date: String(birthDateInput?.value || "").trim(),
          city: String(birthCityInput?.value || "").trim(),
          country: String(birthCountryInput?.value || "").trim(),
        },
        company: {
          name: String(companyNameInput?.value || "").trim(),
          siret: String(siretInput?.value || "").trim(),
        },
      },
      project: {
        niche: nicheFinal,
        delai_estime: String(estimatedDelayInput?.value || "").trim(),
      },
      config: {
        checks,
        affExtra: clampInt(affExtraInput?.value ?? 0, 0, 20),
        contentPack: Number(contentRadio?.value || 150),
        monthly: Number(monthlyRadio?.value || 0),
        langCount: getLangCount(),
        langs: getSelectedLangValues(),
        consent: Boolean(opsConsent?.checked),
      },
      totals: {
        oneShot: Number(totalOneShotField?.value || 0),
        monthly: Number(totalMonthlyField?.value || 0),
      },
      recap: String(recapField?.value || ""),
      source: "configurateur",
    };

    try {
      sessionStorage.setItem(orderKey, JSON.stringify(order));
      e.preventDefault();
      window.location.href = "/paiement/";
    } catch {
      e.preventDefault();
      alert("Impossible de préparer la commande (stockage navigateur). Essaie un autre navigateur ou désactive le mode privé.");
    }
  });

  // Presets (query param ?preset=...)
  function applyPreset(presetName) {
    const presets = {
      sprint: {
        aff1: true,
        affExtra: 0,
        langCount: 1,
        langs: ["fr"],
        checks: {},
        contentPack: "490",
        monthly: "0",
      },
      launch: {
        aff1: true,
        affExtra: 0,
        langCount: 1,
        langs: ["fr"],
        checks: { seo_silos: true },
        contentPack: "990",
        monthly: "0",
      },
      growth: {
        aff1: true,
        affExtra: 1,
        langCount: 1,
        langs: ["fr"],
        checks: { seo_silos: true, performance: true, schema: true },
        contentPack: "1890",
        monthly: "0",
      },
    };

    const preset = presets[presetName];
    if (!preset) return false;

    if (aff1) aff1.checked = Boolean(preset.aff1);
    if (affExtraInput) affExtraInput.value = String(clampInt(preset.affExtra, 0, 20));

    if (langCountInput) langCountInput.value = String(clampInt(preset.langCount ?? 1, 1, Number(langCountInput.max || 8)));
    buildLangOptions();
    const desired = new Set((Array.isArray(preset.langs) && preset.langs.length ? preset.langs : ["fr"]).map(String));
    for (const opt of getLangOptionEls()) {
      opt.checked = desired.has(String(opt.value || ""));
    }
    applyLanguageRules(getLangOptionEls().find((o) => o.checked) || null);

    for (const [name, checked] of Object.entries(preset.checks)) {
      const el = root.querySelector(`input[type="checkbox"][name="${name}"]`);
      if (el) el.checked = Boolean(checked);
    }

    const contentRadio = root.querySelector(`input[type="radio"][name="contentPack"][value="${preset.contentPack}"]`);
    if (contentRadio) contentRadio.checked = true;

    const monthlyRadio = root.querySelector(`input[type="radio"][name="monthly"][value="${preset.monthly}"]`);
    if (monthlyRadio) monthlyRadio.checked = true;

    render();
    return true;
  }

  const params = new URLSearchParams(window.location.search);
  const presetName = params.get("preset");
  if (presetName) applyPreset(presetName);

  opsConsent?.addEventListener("change", updateSubmitState);
  updateNicheOtherVisibility();
  render();
}

function setupCheckout() {
  const payBtn = document.getElementById("payBtn");
  const empty = document.getElementById("checkoutEmpty");
  const content = document.getElementById("checkoutContent");
  const recapEl = document.getElementById("checkoutRecap");
  const totalEl = document.getElementById("checkoutTotal");
  const monthlyEl = document.getElementById("checkoutMonthly");
  if (!payBtn || !empty || !content || !recapEl || !totalEl || !monthlyEl) return;

  const orderKey = "ecomshop_order_v1";
  let order = null;
  try {
    order = JSON.parse(sessionStorage.getItem(orderKey) || "null");
  } catch {
    order = null;
  }

  const hasOrder = Boolean(order && order.config && order.customer);
  empty.hidden = hasOrder;
  content.hidden = !hasOrder;

  if (!hasOrder) {
    payBtn.disabled = true;
    return;
  }

  recapEl.textContent = String(order.recap || "").trim() || "Récap indisponible.";
  const oneShot = Number(order.totals?.oneShot || 0);
  const monthly = Number(order.totals?.monthly || 0);
  totalEl.textContent = moneyEUR(oneShot);
  monthlyEl.textContent = `${moneyEUR(monthly)} / mois`;

  if (!order.config?.consent) {
    payBtn.disabled = true;
    payBtn.textContent = "Retour pour valider l’autorisation";
    return;
  }

  payBtn.disabled = false;
  payBtn.addEventListener("click", async () => {
    payBtn.disabled = true;
    const originalText = payBtn.textContent;
    payBtn.textContent = "Redirection…";

    try {
      const checkoutOrder = {
        customer: {
          email: String(order?.customer?.email || "").trim(),
          name: String(order?.customer?.name || "").trim(),
        },
        project: order?.project || {},
        config: order?.config || {},
      };

      const res = await fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutOrder),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Erreur paiement (${res.status})`);
      }
      if (!data.url) throw new Error("Réponse paiement invalide.");
      window.location.href = data.url;
    } catch (err) {
      payBtn.disabled = false;
      payBtn.textContent = originalText;
      alert(String(err?.message || err || "Impossible de démarrer le paiement."));
    }
  });
}

async function submitNetlifyForm(formName, fields) {
  const body = new URLSearchParams();
  body.set("form-name", formName);
  body.set("bot-field", "");
  for (const [key, value] of Object.entries(fields || {})) {
    body.set(key, String(value ?? ""));
  }

  const res = await fetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return res.ok;
}

function setupThankYou() {
  if (document.body?.dataset?.page !== "merci") return;

  const params = new URLSearchParams(window.location.search);
  const stripeSessionId = params.get("session_id");
  if (!stripeSessionId) return;

  const orderKey = "ecomshop_order_v1";
  let order = null;
  try {
    order = JSON.parse(sessionStorage.getItem(orderKey) || "null");
  } catch {
    order = null;
  }

  if (!order || !order.customer || !order.config?.consent) return;

  const addr = order.customer.address || {};
  const birth = order.customer.birth || {};
  const company = order.customer.company || {};
  const project = order.project || {};
  const totals = order.totals || {};

  const fields = {
    stripe_session_id: stripeSessionId,
    created_at: order.createdAt || "",
    prenom: order.customer.firstName || "",
    nom: order.customer.lastName || "",
    email: order.customer.email || "",
    telephone: order.customer.phone || "",
    adresse_l1: addr.line1 || "",
    adresse_l2: addr.line2 || "",
    code_postal: addr.postalCode || "",
    ville: addr.city || "",
    pays: addr.country || "",
    date_naissance: birth.date || "",
    lieu_naissance_ville: birth.city || "",
    lieu_naissance_pays: birth.country || "",
    societe: company.name || "",
    siret: company.siret || "",
    niche: project.niche || "",
    delai_estime: project.delai_estime || project.delaiEstime || project.delai || "",
    nombre_langues: String(order.config?.langCount ?? ""),
    langues: Array.isArray(order.config?.langs) ? order.config.langs.join(", ") : "",
    total_one_shot: String(totals.oneShot ?? ""),
    total_monthly: String(totals.monthly ?? ""),
    recap: String(order.recap || ""),
    config_json: JSON.stringify(order.config || {}),
  };

  submitNetlifyForm("commande", fields)
    .then((ok) => {
      if (!ok) return;
      try {
        sessionStorage.removeItem(orderKey);
      } catch {}
    })
    .catch(() => {});
}

function setupScrollAnimations() {
  const sections = document.querySelectorAll("[data-reveal]");
  if (sections.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      }
    },
    {
      rootMargin: "0px 0px -100px 0px",
      threshold: 0.1,
    }
  );

  for (const section of sections) {
    observer.observe(section);
  }

  document.body.classList.add("reveal-ready");
}

function main() {
  setupNav();
  setupScrollAnimations();
  setupHeroBackground();

  const root = document.getElementById("cfgForm");
  if (root) setupConfigurator(root);

  setupCheckout();
  setupThankYou();
}

main();
