# Politique de sécurité — Stacks Drive

> Ce document décrit comment signaler une faille, ce que le système
> protège, et ce qui est hors périmètre. Il est public : il ne contient
> aucun secret, aucune mécanique interne exploitable, et aucune
> information sur des failles non corrigées.

## Signaler une faille

**Contact : stacks.markett@gmail.com** — objet : « [Sécurité] Stacks Drive —
brève description ».

Règles :

1. **Ne publiez jamais une faille avant sa correction.** Aucune
   divulgation publique, aucun post, aucun dépôt, avant d'avoir reçu
   confirmation que le correctif est déployé.
2. Décrivez la faille concrètement : ce que vous avez fait, ce que vous
   avez observé, et comment la reproduire (étapes, requêtes, captures).
   Un rapport reproductible est traité en priorité.
3. Ne détruisez, ne modifiez et n'exfiltrez aucune donnée réelle :
   limitez-vous à votre propre compte et à vos propres courses. Ne
   testez jamais sur le compte d'un autre utilisateur.
4. Ne menez pas d'attaque par déni de service, de spam ou de force
   brute à grande échelle : un petit nombre de requêtes suffit à
   démontrer un problème.
5. Vous recevrez un accusé de réception, puis une confirmation une fois
   le correctif déployé. Il n'y a pas de programme de récompense
   monétaire : la contrepartie est la correction et, si vous le
   souhaitez, une mention dans le `CHANGELOG.md`.

## Périmètre

**Dans le périmètre :**

- L'application web https://stacks-drive.vercel.app (toutes les pages
  et routes `/api/*`).
- L'API Supabase du projet (PostgREST, Auth, Realtime) — y compris les
  appels directs qui contournent l'interface : c'est précisément ce que
  les politiques RLS et les triggers sont censés empêcher.
- Les flux métier : création de course, propositions et
  contre-propositions, acceptation et prix figé, code PIN, messagerie
  de course, suivi de position, vérification chauffeur, litiges,
  règlements hebdo, trafic communautaire.

**Hors périmètre :**

- Les services tiers eux-mêmes (Supabase, Vercel, Resend, OSRM, Esri,
  Nominatim) : signalez leurs failles à leurs propres programmes.
- Le phishing, l'ingénierie sociale et la sécurité des appareils des
  utilisateurs.
- Les failles qui exigent un accès physique à un appareil ou un compte
  déjà compromis.
- Les rapports sans preuve d'impact (en-têtes manquants sans scénario
  d'exploitation, versions de dépendances sans démonstration).

## Modèle de sécurité (résumé)

Le détail complet est dans `docs/ARCHITECTURE.md` (§5 et §6 — modèle de
menaces avec pointeurs vers le code). Résumé :

- **Défense en profondeur, 3 couches :** interface (affiche seulement),
  routes API (validation Zod, contrôles serveur, bornes tarifaires),
  base de données (politiques RLS + trigger anti-escalade — la couche
  qui s'applique même en cas d'appel direct à Supabase).
- **Aucune clé `service_role` dans le dépôt.** Seule la clé anon
  publique est exposée ; l'accès aux données passe par RLS.
- **Prix validés côté serveur uniquement** : bornes absolues
  400–50 000 FCFA (`lib/fare-guard.ts`) ; commission plafonnée à 10 %
  et figée par course (`lib/commission.ts`).
- **Bascule passager → chauffeur impossible sans compte chauffeur
  créé**, et mise en ligne impossible sans compte vérifié — verrou côté
  serveur (PATCH `/api/profile`) **et** trigger en base
  (`supabase/migration-v2.17-mode-rules.sql`).
- **Code PIN à 4 chiffres** : 5 codes faux = course verrouillée,
  déverrouillage admin uniquement.
- **Confidentialité chauffeur :** identité visible uniquement pendant
  le matching ou une course acceptée / terminée ; numéro de téléphone
  jamais affiché ; fonction `get_public_ride` minimale.
- **Vérification chauffeur :** selfie + pièce d'identité (OCR),
  décision automatique ou ticket admin ; re-vérification selfie
  ponctuelle.
- **Détection de fraude :** 4 signaux (annulations en série, vitesse
  impossible > 150 km/h, faux PIN répétés, téléphone partagé),
  blocage temporaire réversible, tracé dans le journal d'audit.
- **Journal d'audit** (`audit_log`, lecture admin uniquement) :
  annulations, PIN, fraude, litiges, règlements.
- **Données minimales :** positions chauffeur supprimées après 24 h ;
  aucune coordonnée précise conservée dans la liste d'attente hors zone ;
  selfie de vérification jamais affiché.

## Limites connues (déclarées, pas cachées)

- La position GPS d'un chauffeur est une déclaration de son appareil :
  il n'y a pas d'attestation GPS côté serveur. La parade est la
  détection a posteriori (vitesse impossible) et la limitation de
  l'exposition (position partagée uniquement pendant une course
  acceptée, supprimée après 24 h).
- Les signaux OCR / visage de la vérification sont rapportés par le
  client ; le serveur re-parse le texte OCR et re-calcule la cohérence,
  mais ne refait pas l'OCR lui-même.
- L'application ne touche jamais l'argent : le règlement hebdo repose
  sur la déclaration du chauffeur, validée par l'administrateur.

## Ce qui est attendu d'un contributeur

- Ne jamais introduire de secret dans le code ou dans une doc (voir
  `CONTRIBUTING.md`).
- Ne jamais affaiblir une validation serveur ou une politique RLS pour
  « faire passer » une fonctionnalité : si une règle gêne, elle se
  discute dans une ADR (`docs/adr/`), elle ne se contourne pas.
- Toute modification touchant aux prix, à la commission, au PIN, à la
  vérification ou aux rôles doit être relue avec le modèle de menaces
  (`docs/ARCHITECTURE.md` §6) et accompagnée d'un test de vérification
  (`scripts/verify-*.mjs`) quand un script existe pour le lot.
