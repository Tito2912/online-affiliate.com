import fs from "node:fs";
import path from "node:path";

function listIndexNowKeyFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /^[a-f0-9]{32}\.txt$/i.test(e.name))
    .map((e) => e.name);
}

function pickKeyFile(rootDir, keyFiles) {
  const preferred = process.env.INDEXNOW_KEY_FILE;
  if (preferred) {
    if (!keyFiles.includes(preferred)) {
      throw new Error(
        `INDEXNOW_KEY_FILE est défini mais introuvable à la racine: ${preferred}`
      );
    }
    return preferred;
  }

  if (keyFiles.length === 0) {
    throw new Error(
      "Aucun fichier de clé IndexNow trouvé à la racine. Attendu: <key>.txt (32 hex)."
    );
  }

  if (keyFiles.length === 1) return keyFiles[0];

  const byMtimeDesc = keyFiles
    .map((name) => ({
      name,
      mtimeMs: fs.statSync(path.join(rootDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const chosen = byMtimeDesc[0].name;
  console.warn(
    `Plusieurs clés IndexNow trouvées (${keyFiles.join(
      ", "
    )}). Utilisation automatique de la plus récente: ${chosen}. (Ou définis INDEXNOW_KEY_FILE)`
  );
  return chosen;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").trim();
}

function parseSitemapLocs(sitemapXml) {
  const locs = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let match;

  while ((match = re.exec(sitemapXml))) {
    const url = match[1].trim();
    if (url) locs.push(url);
  }

  return Array.from(new Set(locs));
}

function getHostFromUrls(urls) {
  for (const urlString of urls) {
    try {
      return new URL(urlString).host;
    } catch {
      
    }
  }
  throw new Error("Impossible de déduire le host à partir du sitemap.xml");
}

async function submitToBingIndexNow({ host, key, keyLocation, urlList }) {
  const endpoint = "https://www.bing.com/indexnow";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ host, key, keyLocation, urlList }),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      `IndexNow a échoué (${res.status} ${res.statusText}). Réponse: ${text.slice(0, 500)}`
    );
  }

  return { status: res.status, body: text };
}

async function main() {
  const root = process.cwd();
  const sitemapPath = path.join(root, "sitemap.xml");

  if (!fs.existsSync(sitemapPath)) {
    throw new Error("sitemap.xml introuvable à la racine du projet");
  }

  const keyFiles = listIndexNowKeyFiles(root);
  const keyFileName = pickKeyFile(root, keyFiles);
  const keyFilePath = path.join(root, keyFileName);
  const key = readText(keyFilePath);

  if (key !== keyFileName.replace(/\.txt$/i, "")) {
    throw new Error(
      `La clé dans ${keyFileName} ne correspond pas au nom de fichier. Attendu: ${keyFileName.replace(
        /\.txt$/i,
        ""
      )}`
    );
  }

  const sitemapXml = fs.readFileSync(sitemapPath, "utf8");
  const urlList = parseSitemapLocs(sitemapXml);

  if (urlList.length === 0) {
    throw new Error("Aucune URL trouvée dans sitemap.xml");
  }

  const host = getHostFromUrls(urlList);
  const keyLocation = `https://${host}/${keyFileName}`;

  const chunkSize = 10000;
  let submitted = 0;

  for (let i = 0; i < urlList.length; i += chunkSize) {
    const chunk = urlList.slice(i, i + chunkSize);
    const { status } = await submitToBingIndexNow({
      host,
      key,
      keyLocation,
      urlList: chunk,
    });
    submitted += chunk.length;
    console.log(`IndexNow OK (${status}) - ${submitted}/${urlList.length} URL(s)`);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
