# Automatisation de la vérification chauffeur — v2.4 (interne)

> Document interne (jamais publié sur le site). Décision de Randy,
> 14/11/2026 : « Je dois pas approuver manuellement chaque demande de
> chauffeur » + « Automatise le max de trucs. Si c'est ambigu, je reçois
> le ticket sur mon mail avec explication et compte rendu du souci et
> niveau d'urgence. »

## Ce qui est automatisé

### 1. Contrôles côté client (`components/driver/VerificationForm.tsx`, `lib/verification-client.ts`)

Avant l'envoi, sur le téléphone du chauffeur :

| Contrôle | Outil | Comportement si indisponible |
|---|---|---|
| Dimensions minimales (≥ 400×400) | `createImageBitmap` (+ repli `<img>`) | Dimensions à 0 → signalé, non bloquant seul |
| Visage sur le selfie | API native `FaceDetector` (Chrome/Android) | « indisponible » — jamais bloquant seul |
| OCR de la pièce (nom, naissance, expiration, n° de document) | `tesseract.js` v7, lazy import, langues `fra+eng`, timeout 60 s | Confiance −1, dossier envoyé quand même |
| Empreintes SHA-256 des deux images + du n° de document | `crypto.subtle` | Hash null → doublon non vérifiable côté client |

La progression est affichée honnêtement (« Lecture de ta pièce… 42 % »).
Aucun contrôle technique ne bloque l'envoi : si tout échoue, le dossier
part avec des contrôles vides et le serveur crée un ticket.

### 2. Décision serveur (`app/api/verification/route.ts`, `lib/verification.ts`)

Le serveur re-valide type/taille, re-calcule les empreintes des images
depuis les fichiers reçus, re-parse le texte OCR (MRZ d'abord : TD3
2×44, TD1 3×30, TD2 2×36, avec chiffres de contrôle ; puis repli sur le
texte brut), compare le nom au compte (casse/accents tolérés, prénom+nom
dans un sens ou l'autre) et vérifie les doublons en base.

| Décision | Conditions |
|---|---|
| **Auto-vérifié** (`verifie`) | Visage détecté (ou FaceDetector indisponible + OCR fort) ; nom + naissance (18 ans ou plus) + expiration (non expirée) lus avec confiance forte/moyenne ; nom exact ; aucun doublon |
| **Auto-refusé** (`refuse` + motif précis en « vous ») | Mineur (confiance forte) ; pièce expirée (confiance forte) ; doublon de document ou d'image (vérifié serveur) ; visage absent + OCR illisible |
| **Ambigu** (`en_attente` + ticket) | Tout le reste : OCR partiel, nom approximatif, date incertaine, FaceDetector indisponible + OCR moyen, empreinte incohérente, contrôles indisponibles |

Stockage (`profiles`, migration v2.4) : `verification_checks` (JSONB :
contrôles client + verdicts serveur + raisons), `verification_doc_hash`
(SHA-256 du n° normalisé — **jamais le numéro en clair**),
`verification_image_hash`, `verification_auto_decision`.

### 3. Tickets (`supabase/migration-v2.4.sql`, `lib/tickets.ts`, `components/admin/VerificationTickets.tsx`)

Table `verification_tickets` : id, driver_id, kind, summary, details
(JSONB : raisons + contrôles), urgency, status (ouvert/en_cours/résolu),
created_at, resolved_at, resolved_by, email_sent_at. RLS : admin
partout, chauffeur en lecture de ses propres tickets.

Règles d'urgence :

| Urgence | Cas |
|---|---|
| **Critique** | Doublon de document ou d'image (refus auto + ticket : fraude ou 2e compte possible) |
| **Haute** | Mineur possible ou pièce peut-être expirée (date incertaine) |
| **Moyenne** | Nom approximatif / OCR confiance basse / contrôles indisponibles / empreinte incohérente |
| **Basse** | Photo floue / illisible |

L'admin voit les tickets dans /admin (triés : ouverts d'abord, urgence
puis date), avec filtres urgence/statut, le compte rendu des contrôles,
les documents du chauffeur, et trois actions — **approuver / refuser /
demander de refaire** — qui mettent à jour le profil, le ticket
(résolu, resolved_by) et le journal d'audit (`verification_ticket_*`).
Une décision manuelle via l'ancienne file (« Vérifications
chauffeurs ») résout aussi les tickets ouverts du chauffeur.

### 4. E-mails (`lib/email.ts`, Resend)

La clé `RESEND_API_KEY` est configurée dans Vercel (Production) : les
e-mails de tickets partent. Destinataire : `ADMIN_EMAIL` (défaut :
stacks.markett@gmail.com — boîte Stacks Market, lue par Randy). Objet :
`[Stacks Drive] Ticket vérification — <urgence> — <nom chauffeur>`.
Corps : explication, compte rendu des contrôles, niveau d'urgence, lien
vers /admin. Expéditeur par défaut : `onboarding@resend.dev` (plan
gratuit — ne peut écrire qu'à l'e-mail du propriétaire du compte
Resend : si le premier ticket n'arrive pas dans la boîte Stacks Market,
vérifier le domaine dans Resend ou remettre l'e-mail du compte Resend
en `ADMIN_EMAIL` dans Vercel). Sans clé (en local) : log serveur +
bandeau dans /admin. Voir
SETUP.md (§1) pour les variables d'environnement — **c'est Randy qui a
créé le compte Resend**.

### 5. Deux petites automatisations (même release)

- **Rappel de règlement** (`lib/earnings.ts`, `DriverEarnings.tsx`) :
  bandeau dans « Ce que tu dois » quand le dû > 0 et que le dernier
  règlement date de plus de 7 jours (ou aucun règlement). Données déjà
  dans `driver_settlements` — aucune nouvelle table.
- **Propositions expirées** : déjà automatisé depuis la v2
  (`expire_proposals()` + `expireStaleProposals()` à chaque lecture :
  les propositions de plus de 60 s passent à `expired`). Rien à faire.

### 6. Écriture du statut : pourquoi le trigger a changé

Le trigger anti-escalade (v2) n'autorisait le chauffeur qu'à passer en
`en_attente`. La migration v2.4 remplace `prevent_privilege_escalation()`
: le propriétaire peut passer en `verifie`/`refuse` **uniquement** avec
la charge utile complète et cohérente de la décision automatique
(`verification_auto_decision` = nouveau statut,
`verification_auto_payload_consistent()` vérifie la cohérence du
JSONB). Les autres règles sont inchangées. Le badge `is_verified`
reste synchronisé par le trigger `sync_verified_flag` (v2).

## Limites honnêtes (à ne pas survendre)

1. **Pas de détection de « photo d'une photo ».** Rien ne prouve que le
   selfie est pris en direct, ni que la personne sur le selfie est bien
   celle de la pièce — sans service payant (Veriff, Onfido, Smile
   Identity), aucun outil gratuit ne le garantit. Les contrôles disent
   « il y a un visage » et « la pièce est lisible », pas « c'est la même
   personne ».
2. **Les signaux OCR/visage sont rapportés par le client.** Le serveur
   re-parse le texte, re-calcule les empreintes et vérifie les doublons,
   mais il ne refait pas l'OCR lui-même. Un chauffeur techniquement
   habile pourrait forger une charge utile cohérente en appelant
   l'API directement. Mitigations : images stockées (bucket privé),
   contrôles stockés et visibles par l'admin, doublons vérifiés côté
   serveur, journal d'audit.
3. **OCR imparfait sur photos de mauvaise qualité.** CNI/passeport
   froissés, reflets, faible lumière → confiance basse → ticket (c'est
   le comportement voulu, pas un bug). La MRZ (chiffres de contrôle)
   donne une confiance forte quand elle est lisible.
4. **FaceDetector absent sur iPhone/Safari/Firefox.** Le contrôle est
   marqué « indisponible » et l'OCR fait foi. Sur ces appareils, un
   selfie sans visage + une pièce lisible passe en auto-vérifié si tout
   le reste est bon.
5. **E-mail = Resend uniquement.** Pas de SMS, pas de WhatsApp pour les
   tickets. Si Resend n'est pas configuré, l'admin ne voit les tickets
   que dans /admin.
6. **Le rappel de règlement est un affichage, pas une relance.** Il ne
   bloque rien et n'envoie rien — le blocage au plafond de dette
   (5 000 FCFA) reste la seule contrainte automatique côté argent.

## Fichiers (v2.4)

Créés : `lib/verification.ts` (moteur de décision + parsing MRZ),
`lib/verification-client.ts` (contrôles navigateur),
`lib/email.ts` (Resend), `lib/tickets.ts` (lecture tickets),
`app/api/admin/tickets/route.ts` (résolution),
`components/admin/VerificationTickets.tsx`,
`supabase/migration-v2.4.sql`, `docs/automatisation-verification.md`
(ce fichier).

Modifiés : `app/api/verification/route.ts` (décision auto),
`components/driver/VerificationForm.tsx` (contrôles + écrans de
résultat), `app/compte/page.tsx` (prop `accountName`),
`app/admin/page.tsx` (section tickets + carte « Tickets ouverts »),
`app/api/profile/route.ts` (décision manuelle → résout les tickets),
`lib/audit.ts` (4 événements), `lib/db-types.ts` (champs profils),
`lib/earnings.ts` + `components/driver/DriverEarnings.tsx` (rappel
règlement), `.env.example`, `SETUP.md`, `package.json`
(`tesseract.js` v7, `resend` v6).

Non touchés : `lib/commission.ts`, `lib/pricing.ts`,
`lib/fare-guard.ts`.
