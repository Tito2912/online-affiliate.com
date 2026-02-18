const headerHTML = `
<a href="#contenu" class="skip-link">Aller au contenu</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/">
      <span class="brand-mark"></span>
      <span class="brand-name">online-affiliate</span>
    </a>
    <button class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">Menu</button>
    <nav class="nav" id="siteNav">
      <a class="nav-link" href="/#packs">Packs</a>
      <a class="nav-link" href="/#niches">Niches</a>
      <a class="nav-link" href="/#configurateur">Commander</a>
      <a class="nav-link" href="/#process">Process</a>
      <a class="nav-link" href="/#faq">FAQ</a>
      <a class="nav-link" href="/blog/">Blog</a>
      <a class="nav-link" href="/contact/">Contact</a>
      <a class="btn btn-primary" href="/#configurateur">Commander ton système</a>
    </nav>
  </div>
</header>
`;

const footerHTML = `
<footer class="site-footer">
  <div class="container footer-inner">
        <p class="muted">© <span id="year"></span> online-affiliate. Tous droits réservés.</p>
        <p class="muted">
          <a class="link" href="/#configurateur">Commander</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="/#faq">FAQ</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="/blog/">Blog</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="/contact/">Contact</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="/mentions-legales/">Mentions légales</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="/confidentialite/">Confidentialité</a>
          <span aria-hidden="true">·</span>
          <a class="link" href="/conditions/">Conditions</a>
        </p>
  </div>
</footer>
`;

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
  headerContainer.innerHTML = headerHTML;
  body.prepend(headerContainer);

  // Inject Footer
  const footerContainer = document.createElement('div');
  footerContainer.innerHTML = footerHTML;
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

  // Handle year in footer
  const yearSpan = document.getElementById('year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
}
