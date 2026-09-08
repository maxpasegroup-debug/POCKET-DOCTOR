# Business, medical and privacy readiness

Status: **BLOCKED — business/legal review required**. Pocket Doctor makes no
claim of regulatory compliance, medical certification, approved treatment or
guaranteed outcome. This checklist identifies decisions for qualified reviewers;
it is not legal or medical advice and does not prescribe retention periods.

| Decision / evidence | Responsible owner | Current state |
| --- | --- | --- |
| Legal entity, jurisdiction, privacy contact and grievance/support channels | Business/legal | Not supplied |
| Terms, privacy policy, consent language and version approval | Legal/privacy | No approved documents supplied; UI says pending |
| Records inventory, collection purpose, retention periods and deletion exceptions | Privacy/legal/clinical | Technical inventory and access/export controls exist; approved schedule missing |
| Patient information vs private professional notes and consultation records | Clinical/privacy | Access separated in API; release policy review required |
| Doctor registration, qualifications, specialty and verification evidence | Clinical operations | Operator workflow exists; actual credential verification remains external |
| Program attribution, claims, educational disclaimers and media rights | Clinical/content | DEMO labelled; real content requires review |
| Product eligibility, claims, sale restrictions, provenance and fulfilment | Product/legal/operations | Existing restricted-product checks retained; actual catalogue approval missing |
| Price, cancellation, refund, membership renewal and trial disclosures | Finance/legal | Configurable mechanisms exist; live business policies unapproved |
| Tax/invoice requirements and payment merchant onboarding | Finance/legal | Existing receipts are not asserted to be compliant tax invoices |
| AI provider terms, data processing, retention and clinical safety evaluation | Privacy/clinical/security | Bounded no-diagnosis/no-prescription architecture; external acceptance pending |
| WhatsApp business approval, templates, service window and marketing permission | Communications/privacy | Separate consent and notification adapter; real account acceptance pending |
| Age/minor handling, accessibility, languages and support escalation | Product/legal/clinical | Requires explicit release policy and practical evaluation |
| Store privacy/data-safety declarations and approved brand assets | Business/mobile release | Not supplied |

## Current user controls

Users can edit their basic profile and interests, manage assistant memory and
processing preferences, connect/disconnect WhatsApp, change communication and
marketing choices independently, inspect paginated account exports, and request
deletion of account access. All these APIs derive the user from the authenticated
session. Optional wellness information is not requested as a condition of login.

Deletion immediately blocks access but retains data for case review. It does not
promise immediate erasure of invoices, consultation records or audit evidence.
The privacy queue has no automatic legal decision-maker. Approve a retention
policy, record case decisions, establish request verification and deadlines with
qualified reviewers, and implement the approved erasure/anonymization actions
before treating the process as complete.

## Release sign-off

Attach approved versions/owners/dates to each policy and enable only reviewed
records in `LEGAL_DOCUMENTS`. Validate end-user consent collection for required
documents in staging; the current preferences screen publishes metadata but does
not gate account creation on legal acceptance. Never pre-check optional marketing
or represent a technical switch as legal approval. Keep test and live payment,
content and provider environments separate.
