# État des lieux — Stacks Drive : où on en est, où on dépasse les autres, où on est faible

**Produit :** Stacks Drive — appli de mise en relation chauffeurs / passagers, Libreville d'abord.
**État :** en ligne depuis le 13/11/2026 — https://stacks-drive.vercel.app (web app, Supabase + Vercel).
**Version :** v2.6 en ligne (commit `65996054`, 14/11/2026).
**Auteur :** Ruby, pour Randy (Stacks). **Date :** 14/11/2026.
**Statut :** document de travail interne — pas une promesse commerciale. Les chiffres cités sont ceux connus au 14/11/2026.

---

## 1. Le produit en une page (pour ne pas se perdre)

- **Modèle Uber, pas BlaBlaCar :** les chauffeurs ne publient rien. Ils se mettent en ligne, le passager demande une course, le chauffeur reçoit une pop-up et fait une proposition (prix, places restantes, premier arrêt). Proposition valable 60 s. Si personne ne propose, le périmètre s'élargit (10 km → 25 km après 30 s).
<!-- DOC-SYNC: etat-commission -->
- **Commission validée par Randy :** 5 % au lancement (3 mois), puis 8 % permanent, **plafond 10 % garanti**. La commission est calculée sur le total de la course, supplément route non bitumée compris.
<!-- /DOC-SYNC -->
<!-- DOC-SYNC: etat-deposit -->
- **Garde-fous contre les chauffeurs qui disparaissent sans payer :** **dépôt de garantie remboursable de 5 000 FCFA** à l'inscription (transfert P2P, gardé si le chauffeur part sans solder, remboursé s'il part proprement) + **plafond de dette d'environ 5 000 FCFA** (au-delà, plus de nouvelles demandes tant que ce n'est pas réglé).
<!-- /DOC-SYNC -->
- **Deux types de course :** Solo (privée, directe, prix plein) et Groupe (partagée, prix divisé, arrêts multiples dans l'ordre). Groupe par défaut, avec le badge « LE MOINS CHER ». Moto = Solo uniquement.
- **Paiement — l'appli ne touche jamais l'argent :** le passager paie le chauffeur directement (espèces ou transfert P2P Airtel Money / Moov Money vers son numéro perso). La commission est comptée en silence et réglée **1 fois par semaine, en un seul transfert Mobile Money** vers le numéro perso de Randy. Aucune API de paiement, aucune clé, aucun frais.
- **Vérification chauffeur automatisée dès l'inscription :** selfie + pièce d'identité (CNI / passeport) ou permis ; contrôles automatiques (visage, lecture de la pièce par OCR, doublons) et décision automatique — vérifié, refusé avec motif, ou ticket pour l'admin dans les cas ambigus. Tant que ce n'est pas vérifié, pas de mise en ligne, pas de proposition.
- **Sécurité passager :** SOS (112) + partage de course en direct (lien public de suivi), code PIN à 4 chiffres donné au chauffeur pour démarrer la course.
- **Fidélité :** 10e course offerte (le passager ne paie pas, le chauffeur est payé intégralement, la plateforme absorbe) ; points chauffeur (100 points/course, 10 000 points = 5 courses sans commission).
<!-- DOC-SYNC: etat-pricing -->
- **Prix :** estimation indicative au km — prise en charge + prix au kilomètre (Solo 500 + 210 FCFA/km, Groupe 300 + 135 FCFA/km, Moto = Solo ×0,6), **jamais de surge** ; AUCUN tarif fixe défini par la plateforme. Le prix final est convenu entre le passager et le chauffeur — le chauffeur propose, le passager peut proposer son prix à la demande et contre-proposer — puis il est figé à l'acceptation. Planchers de l'estimation Solo 550 / Groupe 400 FCFA.
<!-- /DOC-SYNC -->
<!-- DOC-SYNC: etat-map -->
- **Carte :** 70 quartiers de Libreville avec leurs noms affichés sur la carte (12 visibles au zoom 12, 30 au zoom 13, 70 au zoom 14), 43 lieux (supermarchés, marchés, stations, pharmacies, hôtels, santé, lieux publics — pictogrammes dès le zoom 13, noms dès le zoom 15), icônes chauffeurs dorées avec note, feuille de demande à 3 positions avec bouton pour la replier et voir la carte.
<!-- /DOC-SYNC -->
<!-- DOC-SYNC: etat-difficult -->
- **Quartiers à accès difficile :** 15 quartiers ne sont pas desservis sur route bitumée — la course s'y arrête par défaut à un point de dépôt sur route bitumée (PK12, Angondjé, Nzeng-Ayong, Owendo selon la zone) ; le passager peut demander la continuité sur route non bitumée pour un supplément forfaitaire de **800 FCFA**, que le chauffeur est libre d'accepter ou non. La commission est calculée sur le total, supplément compris. Tous les PK jusqu'à PK12 inclus sont bitumés et normaux.
<!-- /DOC-SYNC -->
- **Gamification chauffeur :** tableau de bord clair (montant par course, total 24 h, montant dû en temps réel, récaps hebdo et mensuel), célébrations après chaque course, quêtes jour / hebdo, séries, niveaux Bronze / Argent / Or / Diamant, badges, « Course Double » (environ 1 course sur 10 tirée au sort, commission offerte, le chauffeur garde 100 % + la course compte double dans sa quête), « Chauffeur de la semaine ».

---

## 2. Où on dépasse les autres

### 2.1 Tableau comparatif (Libreville, au 14/11/2026)

« Inconnu » veut dire : pas d'information publique fiable trouvée — pas une faiblesse prouvée du concurrent.

| Critère | **Stacks Drive** | **Yango** (arrivé 31/08/2026, partenaire TaxiGo) | **Gozem** (depuis 2021) | **Fly VTC** | **Intrav** | **Taxis classiques** |
|---|---|---|---|---|---|---|
| Commission chauffeur | <!-- DOC-SYNC: etat-table-commission -->**5 % (3 mois) puis 8 %, plafond 10 % garanti**<!-- /DOC-SYNC --> | 0 % au lancement, puis ? (concurrents à 15–30 %) | 15–30 % (fourchette du marché) | Inconnu | Inconnu | 0 % (indépendant, mais pas de clients fournis) |
| Ce que le chauffeur garde | <!-- DOC-SYNC: etat-table-keep -->**92–95 % de chaque course**<!-- /DOC-SYNC --> | 70–85 % après la période de lancement | 70–85 % | Inconnu | Inconnu | 100 % (mais il trouve ses clients seul) |
| Surge (prix qui montent aux heures de pointe) | **Jamais — prix figé une fois accepté** | Oui (surge pricing, faiblesse connue) | Tarifs fixes par zone (pas de surge affiché) | Inconnu | Inconnu | Négociation au cas par cas |
| Course partagée (prix divisé) | **Oui — Groupe par défaut** | Inconnu | Inconnu | Inconnu | Inconnu | Oui (100–500 FCFA/personne en partagé) |
| Prix minimum affiché | <!-- DOC-SYNC: etat-table-min -->Estimation Groupe dès 400 FCFA/passager (indicative, pas un tarif)<!-- /DOC-SYNC --> | Éco dès 600 FCFA | Tarifs fixes par zone | Éco dès 1 000 FCFA | Inconnu | 100–500 FCFA/personne en partagé ; course dès 2 000 FCFA ; aéroport 5 000 FCFA jour / 10 000 FCFA nuit |
| Vérification chauffeur (selfie + pièce d'identité) | **Oui, obligatoire dès le jour 1, automatisée** | Inconnu | Inconnu | Inconnu | Inconnu | Non |
| SOS + partage de course en direct | **Oui (112 + lien de suivi public)** | Inconnu | Inconnu | Inconnu | Inconnu | Non |
| Transparence des gains chauffeur | **Oui — tableau de bord : par course, 24 h, dû en temps réel, récaps hebdo / mensuel** | Inconnu | Inconnu | Inconnu | Inconnu | Le chauffeur sait ce qu'il gagne, pas de tableau de bord |
| Gamification (quêtes, niveaux, célébrations) | **Oui** | Quêtes / Boost (programme mondial Uber/Yango) | Défis (programme Gozem) | Inconnu | Inconnu | Non |
| Paiement | Espèces ou P2P Airtel Money / Moov Money direct au chauffeur | Carte / Mobile Money via l'appli | Mobile Money via l'appli | Airtel / Moov Money | Inconnu | Espèces |
| Fidélité passager | **10e course offerte** | Promos de lancement | Inconnu | Inconnu | Inconnu | Non |
| Quartiers et lieux sur la carte | <!-- DOC-SYNC: etat-table-map -->**Oui — 70 quartiers nommés + 43 lieux**<!-- /DOC-SYNC --> | Inconnu | Inconnu | Inconnu | Inconnu | Non |
| Routes non bitumées | **Oui — point de dépôt + supplément 800 FCFA, chauffeur libre d'accepter** | Inconnu | Inconnu | Inconnu | Inconnu | Au cas par cas |
| Disponibilité | Libreville seulement, 0 chauffeur réel pour l'instant | En croissance depuis août 2026 | Présent depuis 2021 | Présent | Présent | Partout, immédiatement |
| Notoriété | Aucune | Forte (marque mondiale) | Forte (super-app) | Locale | Locale | Totale (habitude) |

### 2.2 Les 3 vraies forces — celles qui font la différence
<!-- DOC-SYNC: etat-force1 -->
**1. Le chauffeur garde 92–95 % de chaque course, contre 70–85 % chez les concurrents.**
C'est l'argument n° 1 pour recruter. Yango est à 0 % de commission au lancement, mais c'est temporaire — après, il retombe dans la fourchette 15–30 % du marché. Nous, le plafond de 10 % est garanti, écrit dans les CGU. Un chauffeur qui fait 10 courses par jour à 1 140 FCFA en moyenne garde environ 65 200 FCFA de plus par mois chez nous que chez un concurrent à 30 % (hypothèse : 1 140 FCFA × 10 courses × 26 jours ; à vérifier avec les vrais chiffres une fois lancé).
<!-- /DOC-SYNC -->

**2. Le prix est figé une fois accepté, jamais de surge.**
Le passager voit une estimation avant de commander et le prix proposé par chaque chauffeur avant d'accepter — une fois accepté, le prix ne bouge pas, même un samedi soir, même sous la pluie. C'est la plainte n° 1 contre Yango et les applis à surge. Le Groupe par défaut (prix divisé, badge « LE MOINS CHER ») attaque en plus le réflexe du taxi partagé, qui est la norme à Libreville.

**3. La sécurité est un argument de vente, pas une case à cocher.**
Vérification selfie + pièce d'identité obligatoire dès le jour 1 (personne ne le fait aussi strictement sur le papier, côté concurrents locaux), SOS 112, partage de course en direct, code PIN pour démarrer la course. Dans un marché où la méfiance envers les chauffeurs inconnus est une faiblesse connue des concurrents, c'est ce qui peut faire choisir Stacks Drive à une passagère le soir.

---

## 3. Où on est faible — honnêtement

**1. Démarrage à froid : 0 chauffeur réel, 0 passager, 0 course réelle.**
L'appli tourne avec 6 chauffeurs démo fictifs. Une appli de mise en relation vide ne sert à rien : le passager qui ouvre et ne trouve personne ne revient pas. C'est le risque n° 1, devant tous les autres.

**2. Pas d'appli dans les stores — web app seulement.**
Stacks Drive est une web app (navigateur). Pas de publication App Store / Google Play — il faudrait un habillage (type Capacitor), pas une reconstruction. Conséquence : pas d'icône sur l'écran d'accueil par défaut, pas de notifications push natives, moins de crédibilité aux yeux de certains utilisateurs. Atténuation : une web app s'ouvre par un simple lien WhatsApp, sans téléchargement — c'est aussi un avantage au démarrage.

**3. Pas de paiement in-app.**
Le passager paie en espèces ou par transfert P2P direct au chauffeur. C'est un choix délibéré (l'appli ne touche jamais l'argent, aucun frais, aucune API), mais ça a un coût : pas de paiement par carte, pas de preuve de paiement automatique dans l'appli, et la commission repose sur le règlement hebdo + le dépôt + le plafond. Si un chauffeur fait une semaine de courses puis disparaît, le dépôt (5 000 FCFA) couvre environ une semaine de commissions — pas plus. Le modèle est honnête, il faut juste ne pas le sur-vendre : la confiance est encadrée, pas éliminée.

**4. Pas de notoriété, une seule ville, une toute petite équipe.**
Yango est une marque mondiale, Gozem est là depuis 2021, Taxi Gab+ aligne 1 066 véhicules. Nous, c'est Randy, seul, avec une appli lancée le 13/11/2026. Pas de budget pub, pas de partenariat, pas de flotte. La seule réponse possible : être meilleur sur le terrain (chauffeurs contents, passagers en sécurité) et grandir par le bouche-à-oreille, pas par la pub.
<!-- DOC-SYNC: etat-weakness5 -->
**5. Fiabilité : l'estimation est calculée côté serveur, les prix convenus sont validés côté serveur, le circuit complet n'a jamais été testé en conditions réelles.**
Depuis la v2.2 : estimation calculée côté serveur uniquement, bornes absolues de sécurité (400–50 000 FCFA, pas de prix fou), pas de double commission (idempotence), journal d'audit, blocage + message clair en cas d'anomalie, page d'erreur de marque (« Service momentanément indisponible ») si ça plante vraiment. Reste vrai : le circuit complet (estimation → prix convenu → commission → règlement hebdo → dépôt → plafond) n'a jamais été testé avec de vrais chauffeurs et de vraies courses. Un bug de trop-perçu ou de double commission au lancement tuerait la confiance des chauffeurs en une semaine.
<!-- /DOC-SYNC -->

**6. Détails produit connus.**
- Les 6 chauffeurs démo sont toujours affichés (profils fictifs, signalés comme tels dans les mentions légales).
- Le flux « Me localiser » complet et une vraie inscription / connexion n'ont jamais été testés par Randy sur son téléphone.
- Statut juridique d'intermédiaire vs transporteur : les CGU sont rédigées mais n'ont pas été relues par un juriste (responsabilité, assurance, loi gabonaise).
- Les e-mails de tickets de vérification partent via Resend (clé configurée dans Vercel) ; l'expéditeur du plan gratuit (`onboarding@resend.dev`) ne peut écrire qu'à l'e-mail du propriétaire du compte Resend.

---

## 4. Paperasse — ce qui existe dans le dépôt GitHub BVDMANN/Stacks-Drive

| Document | Chemin exact dans GitHub | État au 14/11/2026 |
|---|---|---|
| README | `README.md` | Complet (produit, stack, installation, migrations, règles). |
| Guide de mise en ligne et de maintenance | `SETUP.md` | Complet (guide unique, v1 → v2.6). |
| Note historique v2 | `SETUP-v2.md` | Résumé de ce que la v2 a changé. |
| État des lieux (ce document) | `docs/etat-des-lieux-lancement.md` | À jour au 14/11/2026. |
| Vérification automatisée | `docs/automatisation-verification.md` | À jour (v2.4). |
| Schéma base de données v1 | `supabase/schema.sql` | Exécuté. Ne jamais réexécuter. |
| Migrations | `supabase/migration-v2.sql`, `migration-v2.2.sql`, `migration-v2.3.sql`, `migration-v2.4.sql`, `migration-v2.6.sql` | Toutes exécutées une fois. Ne jamais réexécuter. |
| CGU | `app/cgu/page.tsx` | <!-- DOC-SYNC: etat-paperasse-cgu -->Faites — dépôt + plafond (5 000 FCFA, règlement hebdo), routes non bitumées (§6 : point de dépôt + supplément 800 FCFA, chauffeur libre).<!-- /DOC-SYNC --> |
| Politique de confidentialité | `app/confidentialite/page.tsx` | Faite. |
| Politique cookies | `app/cookies/page.tsx` | Faite — lien présent dans le pied de page. |
| Mentions légales | `app/mentions-legales/page.tsx` | Faites — précisent que les 6 chauffeurs affichés sont des profils de démonstration fictifs. |
| Règles de commission | `lib/commission.ts` | <!-- DOC-SYNC: etat-paperasse-commission -->5 % / 8 % / plafond 10 %. Ne pas toucher aux taux sans décision de Randy.<!-- /DOC-SYNC --> |
| Estimation indicative (`lib/pricing.ts`) | `lib/pricing.ts` | <!-- DOC-SYNC: etat-paperasse-pricing -->Prise en charge + prix au km (Solo 500 + 210/km, Groupe 300 + 135/km, Moto ×0,6), AUCUN tarif fixe — le prix final est convenu entre le passager et le chauffeur, supplément route non bitumée 800 FCFA.<!-- /DOC-SYNC --> |
| Quartiers et accès difficile | `lib/neighborhoods.ts` | <!-- DOC-SYNC: etat-paperasse-neighborhoods -->70 quartiers, 15 à accès difficile, points de dépôt.<!-- /DOC-SYNC --> |
| Lieux sur la carte | `lib/pois.ts` | <!-- DOC-SYNC: etat-paperasse-pois -->43 lieux.<!-- /DOC-SYNC --> |
| Modèle de variables d'environnement | `.env.example` | Fait. |
| Code source complet | `app/`, `components/`, `lib/`, `styles/`, `public/`, `types/` | En ligne (v2.6, commit `65996054`). |

### Règle de rangement
- Tous les documents de pilotage vont dans **`docs/`** à la racine du dépôt.
- Les pages légales restent dans `app/` (ce sont des pages du site, pas des documents internes).
- Les guides techniques restent à la racine (`SETUP.md`) et dans `supabase/`.

---

## 5. En résumé — ce qu'il faut retenir

**Les 3 forces :**
1. Le chauffeur garde 92–95 % de chaque course (plafond de commission 10 % garanti) — l'argument qui recrute.
2. Prix fixe, jamais de surge — l'argument qui fidélise les passagers.
3. Sécurité prise au sérieux (vérification jour 1 automatisée, SOS, partage de course, code PIN) — l'argument qui fait choisir Stacks Drive le soir.

**Les 3 faiblesses :**
1. Démarrage à froid : 0 chauffeur réel, 0 passager — une appli vide ne sert à rien.
2. Pas d'appli dans les stores, pas de paiement in-app, pas de notoriété — on part de zéro contre des marques installées.
3. Le circuit argent (prix, commission, règlement hebdo) n'a jamais été testé en conditions réelles — un seul bug de trop-perçu peut tuer la confiance.
