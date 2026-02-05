# online-affiliate.com

Site statique prêt à déployer sur **Netlify** : landing + configurateur (prix en temps réel) + parcours de **commande** avec page de
paiement (Stripe via Netlify Functions).

## Déploiement Netlify

- **Build command** : aucune (vide)
- **Publish directory** : `.` (racine)
- **Functions directory** : `netlify/functions`

Variables d’environnement à configurer sur Netlify :

- `STRIPE_SECRET_KEY` (clé secrète Stripe pour créer une session Checkout)

## Développement local

Depuis la racine du projet :

```bash
python3 -m http.server 8080
```

Puis ouvre `http://localhost:8080`.

Note : la page `/paiement/` appelle une fonction Netlify (`/.netlify/functions/create-checkout-session`). Pour tester le paiement en local,
utilise Netlify CLI (`netlify dev`).

## Personnalisation rapide

- Texte/sections : `index.html`
- Prix/options du configurateur : `index.html` (attributs `data-price`, `data-unit-price`, valeurs des radios)
- Logique du configurateur : `assets/app.js`
- Styles : `assets/styles.css`

Pense à remplacer le domaine `https://online-affiliate.com/` (OpenGraph + `sitemap.xml`) si tu déploies sur une autre URL.

## IndexNow

Le projet inclut une clé IndexNow (fichier texte à la racine) pour accélérer l’indexation.

- Fichier de clé : `bef69f2e6ba224ca95862baa7b49f775.txt`
- URL attendue après déploiement : `https://online-affiliate.com/bef69f2e6ba224ca95862baa7b49f775.txt`

Soumettre toutes les URLs du `sitemap.xml` à IndexNow (Bing) :

```bash
npm run indexnow:submit
```

Astuce : si tu as plusieurs fichiers de clé `*.txt` à la racine, le script choisit automatiquement la clé la plus récente. Tu peux forcer une clé avec :

```bash
INDEXNOW_KEY_FILE=bef69f2e6ba224ca95862baa7b49f775.txt npm run indexnow:submit
```

## Test paiement (Stripe)

1) Crée un fichier `.env` à la racine (ne pas committer) :

```bash
cp .env.example .env
```

Puis remplace `STRIPE_SECRET_KEY` par ta clé **test** (`sk_test_...`).

2) Lance Netlify en local (pour les Functions) :

```bash
npx netlify dev
```

3) Parcours complet :
- `http://localhost:8888/` → compose un pack → valider → aller sur `/paiement/`
- Clique “Procéder au paiement” → Stripe Checkout (test)
- Carte test Stripe : `4242 4242 4242 4242` / date future / CVC `123`
- Vérifie les redirections : `/merci/?session_id=...` et `/paiement/annule/`

Note : l’envoi du formulaire Netlify (sur la page `merci`) est réellement visible dans le dashboard Netlify une fois déployé.

