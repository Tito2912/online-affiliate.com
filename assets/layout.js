function isEnglishPath(pathname) {
  const p = String(pathname || "/");
  return p === "/en" || p.startsWith("/en/");
}

function getLangPrefix(pathname) {
  return isEnglishPath(pathname) ? "/en" : "";
}

function buildAlternatePath(pathname) {
  const p = String(pathname || "/");
  if (isEnglishPath(p)) {
    const stripped = p.replace(/^\/en(?=\/|$)/, "");
    return stripped || "/";
  }
  if (p === "/404.html") return "/";
  return `/en${p === "/" ? "/" : p}`;
}

function getStrings(lang) {
  if (lang === "en") {
    return {
      skip: "Skip to content",
      menu: "Menu",
      nav: {
        packs: "Packs",
        niches: "Niches",
        order: "Order",
        process: "Process",
        faq: "FAQ",
        blog: "Blog",
        contact: "Contact",
        cta: "Order your system",
      },
      footerRights: "All rights reserved.",
      footer: {
        order: "Order",
        faq: "FAQ",
        blog: "Blog",
        contact: "Contact",
        legal: "Legal notice",
        privacy: "Privacy",
        terms: "Terms",
        cookies: "Cookies",
      },
      langSwitch: "FR",
      langSwitchLabel: "Version française",
    };
  }

  return {
    skip: "Aller au contenu",
    menu: "Menu",
    nav: {
      packs: "Packs",
      niches: "Niches",
      order: "Commander",
      process: "Process",
      faq: "FAQ",
      blog: "Blog",
      contact: "Contact",
      cta: "Commander ton système",
    },
    footerRights: "Tous droits réservés.",
    footer: {
      order: "Commander",
      faq: "FAQ",
      blog: "Blog",
      contact: "Contact",
      legal: "Mentions légales",
      privacy: "Confidentialité",
      terms: "Conditions",
      cookies: "Cookies",
    },
    langSwitch: "EN",
    langSwitchLabel: "English version",
  };
}

function headerHTML(pathname) {
  const lang = isEnglishPath(pathname) ? "en" : "fr";
  const s = getStrings(lang);
  const base = getLangPrefix(pathname);

  return `
<a href="#contenu" class="skip-link">${s.skip}</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${base || "/"}">
      <span class="brand-mark"></span>
      <span class="brand-name">online-affiliate</span>
    </a>
    <button class="nav-toggle" id="navToggle" aria-label="${s.menu}" aria-expanded="false">${s.menu}</button>
    <nav class="nav" id="siteNav">
      <a class="nav-link" href="${base}/#packs">${s.nav.packs}</a>
      <a class="nav-link" href="${base}/#niches">${s.nav.niches}</a>
      <a class="nav-link" href="${base}/#configurateur">${s.nav.order}</a>
      <a class="nav-link" href="${base}/#process">${s.nav.process}</a>
      <a class="nav-link" href="${base}/#faq">${s.nav.faq}</a>
      <a class="nav-link" href="${base}/blog/">${s.nav.blog}</a>
      <a class="nav-link" href="${base}/contact/">${s.nav.contact}</a>
      <a class="nav-link" id="langSwitch" href="${buildAlternatePath(pathname)}" aria-label="${s.langSwitchLabel}">${s.langSwitch}</a>
      <a class="btn btn-primary" href="${base}/#configurateur">${s.nav.cta}</a>
    </nav>
  </div>
</header>
`;
}

function footerHTML(pathname) {
  const lang = isEnglishPath(pathname) ? "en" : "fr";
  const s = getStrings(lang);
  const base = getLangPrefix(pathname);

  return `
<footer class="site-footer">
  <div class="container footer-inner">
        <p class="muted">© <span id="year"></span> online-affiliate. ${s.footerRights}</p>
        <p class="muted">
          <a class="link" href="${base}/#configurateur">${s.footer.order}</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="${base}/#faq">${s.footer.faq}</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="${base}/blog/">${s.footer.blog}</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="${base}/contact/">${s.footer.contact}</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="${base}/mentions-legales/">${s.footer.legal}</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="${base}/confidentialite/">${s.footer.privacy}</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="${base}/conditions/">${s.footer.terms}</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="#" id="cookiePrefs">${s.footer.cookies}</a>
        </p>
  </div>
</footer>
`;
}

/**
 * Injects the header and footer into the document.
 * @param {string} currentPage - The path of the current page (e.g., '/', '/contact/').
 */
export function injectLayout(currentPage = '/') {
  const body = document.body;

  // Ensure a background host exists on every page.
  if (!document.getElementById("particles-js")) {
    const bg = document.createElement("div");
    bg.id = "particles-js";
    body.prepend(bg);
  }
  
  // Inject Header
  const headerContainer = document.createElement('div');
  headerContainer.innerHTML = headerHTML(currentPage);
  body.prepend(headerContainer);

  // Inject Footer
  const footerContainer = document.createElement('div');
  footerContainer.innerHTML = footerHTML(currentPage);
  body.append(footerContainer);

  // Set active link
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    const href = link.getAttribute('href') || '';
    // Compare the link's href with the current page. Also mark parent sections active (e.g. /blog/ on /blog/...).
    if (href === currentPage || (href.endsWith('/') && href !== '/' && currentPage.startsWith(href))) {
      link.classList.add('active');
    }
  });

  // Preserve query/hash for language switch.
  const langSwitch = document.getElementById("langSwitch");
  if (langSwitch) {
    const altPath = buildAlternatePath(currentPage);
    langSwitch.setAttribute("href", `${altPath}${window.location.search || ""}${window.location.hash || ""}`);
  }

  // Handle year in footer
  const yearSpan = document.getElementById('year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
}
