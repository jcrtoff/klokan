# Klokan — Loi 25 Compliance Brief

> Drop this file at the root of the repo alongside `KLOKAN_DESIGN_BRIEF.md`.
> Reference it in Claude Code with:
> _"Implement the compliance requirements in `KLOKAN_LEGAL_COMPLIANCE.md`"_
>
> ⚠️ All requirements below are **mandatory before going live with real brokers**.
> Klokan collects personal information (name, email, phone, budget, location intent)
> from members of the public via the chat widget. This triggers full Loi 25 obligations.
> All provisions have been in force since September 22, 2024.

---

## 1. Responsibility Split — Klokan vs. Broker

When a lead chats via a broker's embedded widget:

- **Klokan** is the **data processor** — it stores, processes, and transmits the data
- **The broker** is the **data controller** — they commissioned the collection for their business purpose
- Both parties carry independent obligations under Loi 25

> 🔴 **Legal task (not code):** The Klokan Terms of Service and broker onboarding agreement
> must explicitly define this split. Brokers must acknowledge their own Loi 25 obligations
> as data controllers when they activate a widget.
> **Consult a Quebec privacy lawyer before the first paid broker engagement.**

---

## 2. Widget — Consent Step Before Collection

### Why this matters
The chat widget begins profiling the lead the moment they type. Under Loi 25, this constitutes
personal data collection. Consent must be obtained **before** any data is processed.

### What to build — `components/widget/ChatWidget.tsx`

Add a **pre-chat consent screen** that appears on first widget open, before the input bar is active.

**Consent notice text (customize broker name dynamically):**

```
En utilisant ce chat, vous consentez à ce que [Nom du courtier],
via Klokan, collecte vos renseignements personnels (nom, courriel,
téléphone, préférences immobilières) aux fins de vous contacter
au sujet de votre projet immobilier.
Vos données peuvent être traitées par des serveurs situés hors Québec.
```

**Legal requirements — all must be present:**
- Consent must be **explicit and distinct** — a dedicated "J'accepte" button, never a checkbox buried in text
- Link to the full privacy policy at `klokan.live/confidentialite`
- Name the data collector: the broker (powered by Klokan)
- Disclose that data **may be processed outside Quebec** (Anthropic and OpenAI APIs are US-based — this applies)
- State the lead's **right to withdraw consent** at any time
- Store the consent record server-side: `{ sessionId, widgetId, timestamp, consentGiven: true }`

**UI spec (follow `KLOKAN_DESIGN_BRIEF.md` brand tokens):**
- Background: `brand-sand` (`#F2EDE6`)
- Text: `brand-slate` (`#3D4A5C`), DM Sans, 13px
- Primary CTA: `"J'accepte et je commence"` — terracotta button (`brand-terracotta`)
- Secondary: `"Non merci"` — slate-light text link, closes the widget
- Max 4 lines of visible text — compact and trustworthy, not a wall of legalese
- Links to privacy policy and withdrawal option visible below the CTA

**Files to create/modify:**
- `components/widget/ConsentScreen.tsx` — standalone consent component
- `components/widget/ChatWidget.tsx` — render `<ConsentScreen />` before chat if no stored consent
- `lib/consent.ts` — helper to store and check consent state (server-side record + localStorage flag)

---

## 3. Dashboard — Data Handling Features

### 3.1 Hard Delete — "Supprimer ce prospect"

Add a delete action to the lead detail view.

- Label: **"Supprimer ce prospect"** — destructive action, slate-light until hover, then red
- Requires a confirmation modal: _"Êtes-vous sûr ? Cette action est irréversible."_
- Must perform a **hard delete** from the database — not a soft hide or status flag
- Cascade delete: remove all associated messages, profile data, consent records, and extracted fields
- Log the deletion event: `{ sessionId, deletedAt, deletedBy }` for the incident register

**Files to create/modify:**
- `components/leads/DeleteProspectButton.tsx`
- `components/leads/DeleteConfirmModal.tsx`
- `app/api/sessions/[id]/route.ts` — add `DELETE` handler with cascade

### 3.2 Data Retention Policy

- Define maximum retention: **24 months after last message**
- Add a scheduled job (cron) that anonymizes or hard-deletes sessions older than the retention period
- Anonymization means: null out name, email, phone — keep aggregate stats (budget range, property type) for analytics only
- Log each automated anonymization event

**Files to create:**
- `lib/retention.ts` — retention logic and anonymization helper
- `app/api/cron/retention/route.ts` — cron endpoint (can be triggered by Vercel Cron or equivalent)

### 3.3 Data Export (Portability)

Mandatory since September 2024: leads can request their data in a structured format.

- Add an admin-only export endpoint: `GET /api/admin/sessions/[id]/export`
- Returns JSON with all stored fields: name, email, phone, budget, property type, location, timeline, full message transcript, consent timestamp
- This does not need to be self-serve for leads yet — an admin can run it manually on request

**Files to create:**
- `app/api/admin/sessions/[id]/export/route.ts`

### 3.4 AI Profiling Disclosure

Loi 25 requires that profiling functions be **disabled by default** and users informed before activation.
Klokan's AI extraction of budget, property type, location, and timeline constitutes profiling.

- This is handled by the consent step in Section 2 — if the consent text includes the phrase
  _"préférences immobilières"_ and mentions automated processing, the disclosure requirement is met
- No additional UI needed beyond the consent screen

---

## 4. Privacy Policy Page — `klokan.live/confidentialite`

### What to build
Create a public-facing page at `/app/confidentialite/page.tsx` in French.

**Required sections and content:**

| Section | Contenu |
|---|---|
| **Responsable désigné** | Jean-Christophe Roux, Toff Systems Inc. — [email à compléter] |
| **Données collectées** | Nom, courriel, téléphone, budget, type de propriété, localisation, échéancier, transcriptions de conversation |
| **Finalité** | Qualifier les prospects immobiliers et les mettre en relation avec un courtier |
| **Partage des données** | Courtier immobilier assigné · Anthropic (traitement IA) · Fournisseur d'hébergement |
| **Transmission hors Québec** | Oui — les API d'Anthropic sont situées aux États-Unis. Une évaluation des facteurs relatifs à la vie privée (EFVP) a été réalisée. |
| **Conservation** | 24 mois après la dernière interaction, puis anonymisation ou suppression |
| **Droits des personnes** | Accès · Rectification · Suppression · Retrait du consentement · Portabilité |
| **Incidents** | Tout incident présentant un risque sérieux est signalé à la CAI et aux personnes concernées |
| **Contact** | [courriel dédié à la vie privée — ex: confidentialite@klokan.live] |

**Style requirements:**
- Use `KLOKAN_DESIGN_BRIEF.md` brand tokens (Fraunces for headings, DM Sans for body)
- Clean, readable layout — warm white background, slate text
- Must be accessible from the widget consent screen via a direct link
- Add to site footer as well: `Politique de confidentialité`

---

## 5. Privacy Officer Designation

Mandatory since September 2022 — must be published on the privacy policy page.

```
Responsable de la protection des renseignements personnels :
Jean-Christophe Roux
Toff Systems Inc. / Klokan
[courriel]
```

This block must appear visibly on `klokan.live/confidentialite` — not hidden in a footer or collapsed section.

---

## 6. Data Breach Register

Loi 25 requires a register of all confidentiality incidents, even those not reportable to the CAI.

For now: create a simple internal log table in the database.

**Schema:**
```ts
// IncidentLog
{
  id: string
  occurredAt: Date
  discoveredAt: Date
  description: string
  affectedSessions: string[]   // session IDs
  riskLevel: 'low' | 'medium' | 'high'
  reportedToCAI: boolean
  reportedAt?: Date
  actionsTaken: string
}
```

**Files to create:**
- Database migration: `incidents` table
- `app/api/admin/incidents/route.ts` — `GET` (list) and `POST` (create) endpoints
- No UI needed yet — admin can use the API directly or a simple Notion/spreadsheet alongside it

---

## 7. Compliance Checklist — Before First Paid Broker

Claude Code should treat this as a task list. Check off each item as implemented.

- [ ] **Widget:** `ConsentScreen.tsx` implemented with all required disclosures
- [ ] **Widget:** Consent records stored server-side (sessionId + timestamp + widgetId)
- [ ] **Widget:** Link to `klokan.live/confidentialite` live and working
- [ ] **Dashboard:** `"Supprimer ce prospect"` hard delete with cascade implemented
- [ ] **Dashboard:** Retention cron job created (24-month rule)
- [ ] **Dashboard:** Admin export endpoint for data portability live
- [ ] **Policy:** `/confidentialite` page live in plain French with all required sections
- [ ] **Policy:** Privacy officer name and contact published on the page
- [ ] **Database:** `incidents` table and basic log API created
- [ ] **Legal (not code):** Quebec privacy lawyer reviewed ToS and broker agreement
- [ ] **Legal (not code):** EFVP completed for Anthropic/OpenAI API usage (data outside Quebec)

---

## 8. OACIQ Awareness

Quebec real estate brokers are regulated by **OACIQ** (Organisme d'autoréglementation du courtage
immobilier du Québec). OACIQ has its own rules around client data, electronic communications,
and third-party tools.

**No code task here** — but raise this proactively in broker demos:

> _"Klokan est conçu pour être conforme à la Loi 25 et nous avons réfléchi à votre cadre OACIQ.
> Le consentement est obtenu avant toute collecte, les données restent sous votre contrôle,
> et vous pouvez supprimer un prospect à tout moment."_

This signals that Klokan understands the broker's regulatory world, not just its own.
It is a meaningful differentiator against generic CRM tools.
