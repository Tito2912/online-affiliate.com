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
