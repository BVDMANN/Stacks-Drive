# État des lieux — Stacks Drive : où on en est, où on dépasse les autres, où on est faible, et comment on lance

**Produit :** Stacks Drive — appli de mise en relation chauffeurs / passagers, Libreville d'abord.
**État :** en ligne depuis le 13/11/2026 — https://stacks-drive.vercel.app (web app, Supabase + Vercel).
**Version :** v2.1.2 vérifiée en vrai navigateur le 13/11/2026 au soir. v2.2 en construction (tableau de bord chauffeur, gamification, code PIN, vue course chauffeur, recommandations & plaintes).
**Auteur :** Ruby, pour Randy (Stacks). **Date :** 13/11/2026.
**Statut :** document de travail interne — pas une promesse commerciale. Les chiffres cités sont ceux connus au 13/11/2026 ; les projections sont étiquetées comme hypothèses.

---

## 1. Le produit en une page (pour ne pas se perdre)

- **Modèle Uber, pas BlaBlaCar :** les chauffeurs ne publient rien. Ils se mettent en ligne, le passager demande une course, le chauffeur reçoit une pop-up et fait une proposition (prix, places restantes, premier arrêt). Proposition valable 60 s. Si personne ne propose, le périmètre s'élargit (10 km → 25 km après 30 s).
- **Deux types de course :** Solo (privée, directe, prix plein) et Groupe (partagée, prix divisé, arrêts multiples dans l'ordre). Groupe par défaut, avec le badge « LE MOINS CHER ». Moto = Solo uniquement.
- **Commission validée par Randy :** 5 % au lancement (3 mois), puis 8 % permanent, **plafond 10 % garanti**.
- **Paiement — l'appli ne touche jamais l'argent :** le passager paie le chauffeur directement (espèces ou transfert P2P Airtel Money / Moov Money vers son numéro perso). La commission est comptée en silence et réglée **1 fois par semaine, en un seul transfert Mobile Money** vers le numéro perso de Randy. Aucune API de paiement, aucune clé, aucun frais.
- **Garde-fous contre les chauffeurs qui disparaissent sans payer :** **dépôt de garantie remboursable de 5 000 FCFA** à l'inscription (transfert P2P, gardé si le chauffeur part sans solder, remboursé s'il part proprement) + **plafond de dette d'environ 5 000 FCFA** (au-delà, plus de nouvelles demandes tant que ce n'est pas réglé).
- **Vérification chauffeur dès le jour 1 :** selfie + pièce d'identité (CNI / passeport) ou permis ; l'admin valide ou refuse ; tant que ce n'est pas vérifié, pas de mise en ligne, pas de proposition.
- **Sécurité passager :** SOS (112) + partage de course en direct (lien public de suivi), code PIN à 4 chiffres donné au chauffeur pour démarrer la course (v2.2).
- **Fidélité :** 10e course offerte (le passager ne paie pas, le chauffeur est payé intégralement, la plateforme absorbe).
- **Prix :** tarifs fixes par trajet, **jamais de surge**, tarifs aéroport fixes affichés.
- **Gamification chauffeur (v2.2) :** tableau de bord clair (montant par course, total 24 h, montant dû en temps réel, récaps hebdo et mensuel), célébrations après chaque course (confettis, flashs, pourcentages), quêtes jour / hebdo, séries, niveaux Bronze / Argent / Or / Diamant, badges, « Course Double » (environ 1 course sur 10 tirée au sort, commission offerte, le chauffeur garde 100 % + la course compte double dans sa quête), « Chauffeur de la semaine ».

---

## 2. Où on dépasse les autres

### 2.1 Tableau comparatif (Libreville, au 13/11/2026)

« Inconnu » veut dire : pas d'information publique fiable trouvée — pas une faiblesse prouvée du concurrent.

| Critère | **Stacks Drive** | **Yango** (arrivé 31/08/2026, partenaire TaxiGo) | **Gozem** (depuis 2021) | **Fly VTC** | **Intrav** | **Taxis classiques** |
|---|---|---|---|---|---|---|
| Commission chauffeur | **5 % (3 mois) puis 8 %, plafond 10 % garanti** | 0 % au lancement, puis ? (concurrents à 15–30 %) | 15–30 % (fourchette du marché) | Inconnu | Inconnu | 0 % (indépendant, mais pas de clients fournis) |
| Ce que le chauffeur garde | **92–95 % de chaque course** | 70–85 % après la période de lancement | 70–85 % | Inconnu | Inconnu | 100 % (mais il trouve ses clients seul) |
| Surge (prix qui montent aux heures de pointe) | **Jamais — prix garantis** | Oui (surge pricing, faiblesse connue) | Tarifs fixes par zone (pas de surge affiché) | Inconnu | Inconnu | Négociation au cas par cas |
| Course partagée (prix divisé) | **Oui — Groupe par défaut** | Inconnu | Inconnu | Inconnu | Inconnu | Oui (100–500 FCFA/personne en partagé) |
| Prix minimum affiché | Groupe dès 400 FCFA/passager (matrice fixe) | Éco dès 600 FCFA | Tarifs fixes par zone | Éco dès 1 000 FCFA | Inconnu | 100–500 FCFA/personne en partagé ; course dès 2 000 FCFA ; aéroport 5 000 FCFA jour / 10 000 FCFA nuit |
| Vérification chauffeur (selfie + pièce d'identité) | **Oui, obligatoire dès le jour 1** | Inconnu | Inconnu | Inconnu | Inconnu | Non |
| SOS + partage de course en direct | **Oui (112 + lien de suivi public)** | Inconnu | Inconnu | Inconnu | Inconnu | Non |
| Transparence des gains chauffeur | **Oui — tableau de bord : par course, 24 h, dû en temps réel, récaps hebdo / mensuel (v2.2)** | Inconnu | Inconnu | Inconnu | Inconnu | Le chauffeur sait ce qu'il gagne, pas de tableau de bord |
| Gamification (quêtes, niveaux, célébrations) | **Oui (v2.2)** | Quêtes / Boost (programme mondial Uber/Yango) | Défis (programme Gozem) | Inconnu | Inconnu | Non |
| Paiement | Espèces ou P2P Airtel Money / Moov Money direct au chauffeur | Carte / Mobile Money via l'appli | Mobile Money via l'appli | Airtel / Moov Money | Inconnu | Espèces |
| Fidélité passager | **10e course offerte** | Promos de lancement | Inconnu | Inconnu | Inconnu | Non |
| Disponibilité | Libreville seulement, 0 chauffeur réel pour l'instant | En croissance depuis août 2026 | Présent depuis 2021 | Présent | Présent | Partout, immédiatement |
| Notoriété | Aucune | Forte (marque mondiale) | Forte (super-app) | Locale | Locale | Totale (habitude) |

### 2.2 Les 3 vraies forces — celles qui font la différence

**1. Le chauffeur garde 92–95 % de chaque course, contre 70–85 % chez les concurrents.**
C'est l'argument n° 1 pour recruter. Yango est à 0 % de commission au lancement, mais c'est temporaire — après, il retombe dans la fourchette 15–30 % du marché. Nous, le plafond de 10 % est garanti, écrit dans les CGU. Un chauffeur qui fait 10 courses par jour à 1 140 FCFA en moyenne garde environ 65 200 FCFA de plus par mois chez nous que chez un concurrent à 30 % (hypothèse : 1 140 FCFA × 10 courses × 26 jours ; à vérifier avec les vrais chiffres une fois lancé).

**2. Le prix est fixe et garanti, jamais de surge.**
Le passager sait ce qu'il paie avant de commander, même un samedi soir, même sous la pluie. C'est la plainte n° 1 contre Yango et les applis à surge. Le Groupe par défaut (prix divisé, badge « LE MOINS CHER ») attaque en plus le réflexe du taxi partagé, qui est la norme à Libreville.

**3. La sécurité est un argument de vente, pas une case à cocher.**
Vérification selfie + pièce d'identité obligatoire dès le jour 1 (personne ne le fait aussi strictement sur le papier, côté concurrents locaux), SOS 112, partage de course en direct, code PIN pour démarrer la course. Dans un marché où la méfiance envers les chauffeurs inconnus est une faiblesse connue des concurrents, c'est ce qui peut faire choisir Stacks Drive à une passagère le soir.

---

## 3. Où on est faible — honnêtement

**1. Démarrage à froid : 0 chauffeur réel, 0 passager, 0 course réelle.**
L'appli tourne avec 6 chauffeurs démo fictifs. Une appli de mise en relation vide ne sert à rien : le passager qui ouvre et ne trouve personne ne revient pas. C'est le risque n° 1, devant tous les autres. La parade est dans la stratégie (section 5) : recruter les chauffeurs AVANT de parler aux passagers.

**2. Pas d'appli dans les stores — web app seulement.**
Stacks Drive est une web app (navigateur). Pas de publication App Store / Google Play pour l'instant — il faudra un habillage (type Capacitor), pas une reconstruction, mais ce n'est pas fait. Conséquence : pas d'icône sur l'écran d'accueil par défaut, pas de notifications push natives, moins de crédibilité aux yeux de certains utilisateurs. Atténuation : une web app s'ouvre par un simple lien WhatsApp, sans téléchargement — c'est aussi un avantage au démarrage.

**3. Pas de paiement in-app.**
Le passager paie en espèces ou par transfert P2P direct au chauffeur. C'est un choix délibéré (l'appli ne touche jamais l'argent, aucun frais, aucune API), mais ça a un coût : pas de paiement par carte, pas de preuve de paiement automatique dans l'appli, et la commission repose sur le règlement hebdo + le dépôt + le plafond. Si un chauffeur fait une semaine de courses puis disparaît, le dépôt (5 000 FCFA) couvre environ une semaine de commissions — pas plus. Le modèle est honnête, il faut juste ne pas le sur-vendre : la confiance est encadrée, pas éliminée.

**4. Pas de notoriété, une seule ville, une toute petite équipe.**
Yango est une marque mondiale, Gozem est là depuis 2021, Taxi Gab+ aligne 1 066 véhicules. Nous, c'est Randy, seul, avec une appli lancée le 13/11/2026. Pas de budget pub, pas de partenariat, pas de flotte. La seule réponse possible : être meilleur sur le terrain (chauffeurs contents, passagers en sécurité) et grandir par le bouche-à-oreille, pas par la pub.

**5. Fiabilité : le calcul des prix et les paiements doivent être blindés — ce n'est pas encore le cas.**
Exigence posée le 13/11 au soir : prix calculés côté serveur uniquement, bornes de sécurité (pas de sur-facturation, pas de trop-perçu), pas de double commission (idempotence), journal d'audit, blocage + message clair en cas d'anomalie (paiements, tentatives d'intrusion), page d'erreur de marque (« Service momentanément indisponible », look « Libreville la nuit ») si ça plante vraiment. Aujourd'hui, les tarifs sont une matrice fixe côté code (donc stables), mais le circuit complet (calcul → commission → règlement hebdo → dépôt → plafond) n'a jamais été testé avec de vrais chauffeurs et de vraies courses. Un bug de trop-perçu ou de double commission au lancement tuerait la confiance des chauffeurs en une semaine. C'est une priorité v2.2, pas un détail.

**6. Détails produit encore à régler.**
- Noms de quartiers (Nzeng-Ayong, Centre-ville, Glass) absents des libellés de la carte (ils sont dans les listes et les pastilles de tarifs, mais pas écrits sur la carte elle-même).
- Les 6 chauffeurs démo sont toujours affichés — à retirer avant le vrai lancement.
- Le lien vers la politique cookies n'est pas encore dans le pied de page.
- Le flux « Me localiser » complet et une vraie inscription / connexion n'ont jamais été testés par Randy sur son téléphone.
- Statut juridique d'intermédiaire vs transporteur : les CGU sont rédigées mais doivent être relues par un juriste avant le lancement commercial (responsabilité, assurance, loi gabonaise).

---

## 4. Sur quoi jouer — les leviers, classés par priorité

| # | Levier | Action concrète | Coût estimé | Effet attendu |
|---|---|---|---|---|
| 1 | **Recruter les chauffeurs d'abord** | Aller dans les stations de taxis et les groupes WhatsApp de chauffeurs avec une offre claire : 5 % de commission pendant 3 mois, plafond 10 % garanti, dépôt 5 000 FCFA remboursable, tableau de bord transparent. Objectif : ~20 chauffeurs vérifiés en ligne avant de lancer les passagers. | Temps de Randy + 0 FCFA de pub. Le dépôt est remboursable, pas un revenu. | Sans ça, rien ne démarre. C'est le levier n° 1, de loin. |
| 2 | **Vendre le 92–95 % gardés** | Tous les messages aux chauffeurs disent le même chiffre : « Tu gardes 92 à 95 % de chaque course, contre 70 à 85 % ailleurs. » Le tableau de bord chauffeur le montre en temps réel, course par course. | 0 FCFA (c'est du texte + le tableau de bord v2.2). | C'est l'argument qui fait quitter Yango / Gozem. |
| 3 | **Vendre la sécurité aux passagers** | Vérification chauffeur, SOS 112, partage de course, code PIN — mis en avant sur la page d'accueil et dans chaque message de lancement. Cible prioritaire : les femmes qui rentrent le soir, les parents qui font voyager leurs enfants. | 0 FCFA. | La confiance est la raison n° 1 de choisir une appli plutôt qu'un taxi au hasard. |
| 4 | **Prix fixe, jamais de surge** | Le dire une fois, clairement : « Le prix affiché est le prix payé, même samedi soir. » Le Groupe par défaut rend la course partagée moins chère que la Solo. | 0 FCFA. Attention : sur les très courtes courses, Yango Éco dès 600 FCFA peut être moins cher que notre Groupe — ne pas promettre « toujours le moins cher » sur tous les trajets. | Fidélise les passagers réguliers (trajets domicile-travail, aéroport). |
| 5 | **Gamification = rétention chauffeur** | Célébrations après chaque course, quêtes, séries, niveaux, Course Double, Chauffeur de la semaine (v2.2). Même un petit prix doit donner l'impression d'une grande victoire. | Faible : la Course Double coûte environ 75–120 FCFA par course double (juste la commission offerte). Les badges, barres et confettis ne coûtent rien. Les bonus de quête en cash sont à calibrer après les premiers chiffres réels. | Un chauffeur qui s'amuse et qui voit ses gains reste. Le turnover est le problème n° 1 des applis VTC dans le monde. |
| 6 | **Bouche-à-oreille + WhatsApp + TikTok** | Groupes WhatsApp (chauffeurs, quartiers), stations de taxis, bouche-à-oreille, vidéos TikTok courtes (le chauffeur qui montre ses gains, la passagère qui partage sa course). Pas de pub payante au début. | 0 FCFA (temps seulement). | À Libreville, la recommandation d'un proche vaut plus qu'une pub. |
| 7 | **Fiabilité du calcul et des paiements** | Prix côté serveur uniquement, bornes anti-sur-facturation, pas de double commission, journal d'audit, page d'erreur de marque, blocage clair en cas d'anomalie. Tester le circuit complet avec 2 comptes avant le lancement public. | Temps de développement (v2.2). 0 FCFA. | Un seul trop-perçu au lancement = des chauffeurs qui partent et qui préviennent les autres. |
| 8 | **Parrainage** | Un chauffeur parraine un autre chauffeur → récompense (à définir : par exemple 1 course sans commission). Un passager parraine un passager → course offerte (à définir). | À décider : le coût est la récompense elle-même. Ne pas l'activer avant d'avoir les premiers chiffres. | Le canal de croissance le moins cher, une fois que les premiers utilisateurs sont contents. Option v2, pas au lancement. |
| 9 | **Contenu local et propreté du produit** | Retirer les chauffeurs démo, ajouter les noms de quartiers sur la carte (si possible), lien cookies dans le pied de page, tester l'inscription réelle et « Me localiser » sur un vrai téléphone. | 0 FCFA. | Un produit propre inspire confiance ; un produit avec des faux chauffeurs la détruit. |

**Ce qu'il ne faut PAS faire :** acheter de la pub avant d'avoir des chauffeurs en ligne ; promettre « toujours le moins cher » (faux sur les très courtes courses face à Yango Éco 600 FCFA) ; baisser la commission sous 5 % pour attirer (on ne pourra pas remonter après) ; lancer les passagers avant les chauffeurs.

---

## 5. Stratégie de lancement — Libreville, par phases

### Phase 0 — Pré-lancement (maintenant, avant tout contact public)
- Finir la v2.2 (tableau de bord chauffeur, gamification, code PIN, vue course chauffeur, recommandations & plaintes, fiabilité des prix et des paiements).
- Tester avec de vrais comptes : inscription réelle (mail de vérification), nommer Randy admin en SQL, parcours complet demande → proposition → acceptation → code PIN → course terminée → note, avec 2 comptes.
- Retirer les 6 chauffeurs démo. Corriger le lien cookies dans le pied de page.
- Rédiger le pack d'accueil chauffeur et le guide passager (section 6).
- **Critère de sortie :** 2 courses complètes de bout en bout, sans bug, avec de vrais comptes.

### Phase 1 — Recruter les chauffeurs (l'étape qui décide de tout)
- **Objectif : ~20 chauffeurs vérifiés et en ligne.** Pas de lancement passager avant.
- **Où les trouver :** stations de taxis (Centre-ville, Nzeng-Ayong, Owendo, Akanda), groupes WhatsApp de chauffeurs, bouche-à-oreille, chauffeurs Yango / Gozem mécontents de leur commission.
- **Offre de lancement chauffeur :** 5 % de commission pendant 3 mois, plafond 10 % garanti, dépôt 5 000 FCFA remboursable, tableau de bord transparent, gamification, « Chauffeur de la semaine ».
- **Vérification :** chaque chauffeur passe par selfie + pièce d'identité, validé par l'admin. Aucune exception — c'est l'argument sécurité, il ne se négocie pas.
- **Critère de sortie :** 20 chauffeurs vérifiés, en ligne aux heures de pointe, qui ont compris le règlement hebdo et le dépôt.

### Phase 2 — Lancement doux (proches et famille)
- Premiers passagers : proches, famille, amis de Randy et des chauffeurs. Courses réelles, payées normalement.
- Objectif : détecter les bugs, vérifier les temps d'attente, tester le règlement hebdo en conditions réelles, recueillir les premiers retours (recommandations & plaintes, v2.2).
- **Critère de sortie :** au moins 20 courses réelles sans incident majeur, temps d'attente médian acceptable, chauffeurs payés et contents, 0 trop-perçu.

### Phase 3 — Lancement public
- TikTok + groupes WhatsApp + bouche-à-oreille. Message simple : prix fixe sans surge, chauffeurs vérifiés, course partagée la moins chère, 10e course offerte.
- **Offre de lancement passager (à trancher par Randy) :** par exemple première course à prix réduit ou 10e course offerte (déjà dans le produit). Ne pas offrir la gratuité totale sans limite — ça attire les profiteurs, pas les clients.
- **Critère de sortie :** les KPIs ci-dessous sont suivis chaque semaine et s'améliorent.

### KPIs à suivre (chaque semaine, dès la phase 2)
| KPI | Ce qu'il mesure | Objectif de départ (à ajuster après les premiers chiffres) |
|---|---|---|
| Chauffeurs vérifiés | La taille de l'offre | 20, puis 50 |
| Chauffeurs en ligne aux heures de pointe | La disponibilité réelle | Au moins 10 en ligne le soir |
| Courses par jour | L'activité | Croissance semaine après semaine |
| Temps d'attente médian (demande → proposition acceptée) | La rapidité du service | Moins de 5 minutes |
| Taux d'acceptation des propositions | La réactivité des chauffeurs | Plus de 80 % |
| Taux de courses terminées (vs annulées) | La fiabilité | Plus de 90 % |
| Note moyenne des chauffeurs / des passagers | La qualité | Plus de 4,5 / 5 |
| Rétention chauffeurs à 30 jours | Est-ce qu'ils restent ? | Plus de 70 % |
| Commissions dues vs commissions réglées | Est-ce que le règlement hebdo fonctionne ? | 100 % réglé, 0 dette au-delà du plafond |
| Courses Groupe vs Solo | Est-ce que le partagé prend ? | Le Groupe reste majoritaire |

### Hypothèses de revenu (à vérifier avec les vrais chiffres — ne pas les présenter comme des promesses)
Base de calcul validée par Randy le 13/11, mise à jour v2.3 (baisse des prix de 24 %) : course moyenne 1 140 FCFA, 10 courses par jour et par chauffeur, 26 jours par mois.
- À 8 % : **23 712 FCFA par mois et par chauffeur**.
- 20 chauffeurs ≈ **474 240 FCFA / mois** (environ 723 €).
- 50 chauffeurs ≈ **1 185 600 FCFA / mois** (environ 1 808 €).
Ces chiffres supposent des chauffeurs actifs tous les jours et un règlement hebdo à 100 %. Ils ne tiennent pas compte des courses offertes (10e course) ni des courses sans commission échangées contre des points.

---

## 6. Paperasse — checklist des docs

### 6.1 Ce qui existe déjà dans le dépôt GitHub BVDMANN/Stacks-Drive (vérifié le 13/11/2026, branche main, commit `fee96ebb`)

**Réponse à la question de Randy — « où sont les docs dans GitHub ? » :**
Il n'y a **pas de dossier `docs/`** dans le dépôt. Les docs existants sont éparpillés à la racine, dans `supabase/` et dans les pages de l'appli. C'est pour ça que ce document propose de créer `docs/` et d'y ranger tout ce qui suit.

| Document | Chemin exact dans GitHub | État |
|---|---|---|
| README | `README.md` | Quasi vide — juste le titre « # Stacks-Drive ». À compléter. |
| Guide de mise en ligne v1 | `SETUP.md` | Fait (10 357 o). |
| Guide migration v2 | `SETUP-v2.md` | Fait (5 572 o). |
| Schéma base de données v1 | `supabase/schema.sql` | Fait (15 856 o). Ne jamais réexécuter. |
| Migration v2 | `supabase/migration-v2.sql` | Fait (17 644 o). Exécutée une fois, le 13/11. |
| CGU | `app/cgu/page.tsx` | Faites — §6 réécrite dans le modèle dépôt + plafond (5 000 FCFA, règlement hebdo). À faire relire par un juriste avant le lancement commercial. |
| Politique de confidentialité | `app/confidentialite/page.tsx` | Faite — mise à jour dans le modèle dépôt + plafond. |
| Politique cookies | `app/cookies/page.tsx` | Faite — mais le lien n'est PAS dans le pied de page (à ajouter). |
| Mentions légales | `app/mentions-legales/page.tsx` | Faites — précisent que les 6 chauffeurs affichés sont des profils de démonstration fictifs. |
| Règles de commission | `lib/commission.ts` | Fait — 5 % / 8 % / plafond 10 %. Ne pas toucher aux taux sans décision de Randy. |
| Matrice des tarifs fixes | `lib/pricing.ts` | Faite — tarifs par trajet (Solo / Groupe). |
| Modèle de variables d'environnement | `.env.example` | Fait. |
| Code source complet | `app/`, `components/`, `lib/`, `styles/`, `public/`, `types/` | En ligne (v2.1.2). |

### 6.2 Ce qui manque — à créer, dans l'ordre

| # | Document | Contenu | Qui | Quand |
|---|---|---|---|---|
| 1 | **Ce document** | `docs/etat-des-lieux-lancement.md` | Ruby — fait le 13/11 | Maintenant (à pousser avec la v2.2) |
| 2 | **Pack d'accueil chauffeur** | Comment s'inscrire, se faire vérifier, se mettre en ligne, proposer, utiliser le code PIN, voir ses gains et son dû, régler sa commission chaque semaine, le dépôt (5 000 FCFA) et le plafond de dette, les niveaux et la gamification, ce qui est interdit. En français simple, gros boutons, captures d'écran. | Ruby (rédaction) + Randy (validation du ton et des règles) | Avant la phase 1 (recrutement chauffeurs) |
| 3 | **Guide passager** | Comment commander, choisir Solo / Groupe, payer (espèces ou Mobile Money), donner le code PIN, partager sa course, utiliser le SOS, noter le chauffeur, signaler un problème. | Ruby | Avant la phase 2 (lancement doux) |
| 4 | **Relecture juriste des CGU** | Statut d'intermédiaire vs transporteur, responsabilité, assurance, loi gabonaise, données personnelles (loi n° 001/2011, APDPVP). Les CGU portent déjà la mention « sera relu par un juriste avant le lancement commercial ». | Randy (trouver le juriste) + juriste | Avant la phase 3 (lancement public) |
| 5 | **Charte de vérification chauffeur (procédure admin)** | Qui vérifie quoi, dans quel délai, sur quels critères on refuse, comment on gère un faux document, comment on retire un chauffeur. | Ruby | Avant la phase 1 |
| 6 | **Document maître de transmission (handover)** | Tout ce qu'il faut pour reprendre Stacks Drive sans Randy : c'est quoi, ça sert à quoi, pour qui, les documents, les clés, les accès, les comptes (Supabase, Vercel, GitHub), les mots de passe (jamais en clair — où ils sont conservés), les décisions prises et pourquoi. Demandé par Randy le 13/11. | Ruby | À chaque livraison majeure ; version complète avant le lancement public |
| 7 | **Dossier investisseur** | Pitch, business plan, projections, KPIs — à partir des VRAIS chiffres des phases 1 et 2, pas d'hypothèses. | Ruby (rédaction) + Randy (chiffres et décisions) | Après les premiers chiffres réels (phase 2) |
| 8 | **Logo personnel de Randy / identité visuelle** | Logo Stacks Drive (et Stacks en général), prêt pour l'appli, les réseaux et les documents. | Randy (choix) + Ruby (production) | Avant la phase 3 |
| 9 | **Conditions de parrainage** | Seulement si le parrainage est activé (levier n° 8) : qui parraine qui, quelle récompense, quelles limites. | Randy (décision) + Ruby (rédaction) | Quand le parrainage sera activé (v2) |
| 10 | **Registre des incidents** | Processus : quand un bug, un trop-perçu ou une tentative d'intrusion arrive, qui est prévenu, comment on bloque, comment on informe les chauffeurs et les passagers, comment on corrige. | Ruby | Avant la phase 2 |

### 6.3 Règle de rangement (à partir de maintenant)
- Tous les documents de pilotage vont dans **`docs/`** à la racine du dépôt (ce fichier est le premier).
- Les pages légales restent dans `app/` (ce sont des pages du site, pas des documents internes).
- Les guides techniques restent à la racine (`SETUP.md`, `SETUP-v2.md`) et dans `supabase/`.
- Le README (`README.md`) doit être complété : ce que c'est, l'URL en ligne, comment installer, où sont les docs.

---

## 7. En résumé — ce qu'il faut retenir

**Les 3 forces :**
1. Le chauffeur garde 92–95 % de chaque course (plafond de commission 10 % garanti) — l'argument qui recrute.
2. Prix fixe, jamais de surge — l'argument qui fidélise les passagers.
3. Sécurité prise au sérieux (vérification jour 1, SOS, partage de course, code PIN) — l'argument qui fait choisir Stacks Drive le soir.

**Les 3 faiblesses :**
1. Démarrage à froid : 0 chauffeur réel, 0 passager — une appli vide ne sert à rien.
2. Pas d'appli dans les stores, pas de paiement in-app, pas de notoriété — on part de zéro contre des marques installées.
3. La fiabilité du circuit argent (prix, commission, règlement hebdo) n'a jamais été testée en conditions réelles — un seul bug de trop-perçu peut tuer la confiance.

**La recommandation n° 1 pour le lancement :**
**Recruter ~20 chauffeurs vérifiés et en ligne AVANT de parler à un seul passager.** Tout le reste (gamification, TikTok, offre de lancement, dossier investisseur) ne sert à rien si, le jour du lancement, un passager ouvre l'appli et ne trouve personne. Le recrutement se fait sur le terrain — stations de taxis, groupes WhatsApp — avec une seule phrase : « Tu gardes 92 à 95 % de chaque course. »
