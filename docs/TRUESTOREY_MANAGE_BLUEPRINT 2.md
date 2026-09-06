# Truestorey Manage

Product blueprint · 6 September 2026

## The decision

Build a new private client application called **Truestorey Manage**. Its first
module is **Tenancy Care**.

The existing Truestorey site remains the public property intelligence and
editorial product. Truestorey Manage is the authenticated service layer where
clients, tenants, agents and invited contractors coordinate work around a
specific home.

This is not a subdirectory of the live Truestorey codebase. It should be a
separate repository, Vercel project and Supabase project under the same brand.

```text
Truestorey
├── Public property intelligence       truestorey.sg
└── Private client services            manage.truestorey.sg
    └── Tenancy Care                    first module
        ├── Rent records
        ├── Requests and repairs
        ├── Recurring servicing
        ├── Condition reports
        └── Documents and activity
```

Future buyer, seller and ownership modules can join Truestorey Manage without
turning the public site into an account-based application.

## Product promise

> Every matter raised has an owner, a next action and a permanent record.

The system does not promise that a tenancy will have no problems. It makes the
agent's operating discipline visible and gives every authorised party a common
record of what happened.

### Outcomes

- The landlord can see what requires attention without chasing the agent.
- The tenant has one reliable place to report and follow a matter.
- The agent sees the entire portfolio as a queue of actions rather than a set
  of conversations to remember.
- A tenant's representative can act for the tenant without obscuring who made
  the entry.
- A contractor receives only the information needed for one assigned job.
- The tenancy can be exported as a coherent record when it ends.

## First-version boundaries

### Included

- Invite-only login and tenancy-scoped roles
- Property and tenancy setup
- Landlord, tenant and agent dashboards
- Monthly rent cycles with dual acknowledgement
- Requests, complaints and repair workflow
- Recurring air-conditioning servicing
- Move-in and move-out condition reports
- Private document and image uploads
- Contractor guest quote and completion link
- Email and in-app action reminders
- Append-only activity history
- PDF or print-ready tenancy exports

### Excluded

- Holding or routing rent and deposits
- Automated bank reconciliation
- Tenancy agreement generation or electronic signing
- Public contractor marketplace or public reviews
- Contractor payment or escrow
- Automated decisions on urgency, fault, liability or who must pay
- WhatsApp, SMS or telephone marketing
- NRIC, FIN, passport or work-pass storage
- Government submissions
- Tax filing
- Native mobile applications
- AI features in the pilot

## Users and authority

One person can hold different roles in different tenancies. Authority belongs
to a membership in a tenancy, not to a global user type.

| Role | Sees | Can do | Cannot do |
|---|---|---|---|
| Landlord | Entire tenancy record | Confirm rent, approve or reject costs, comment, acknowledge condition and completion, export | Alter another party's original entry |
| Tenant | Own tenancy and accepted job details | Mark rent sent, report matters, upload evidence, propose access, acknowledge completion and condition | Approve landlord spending or view private agent notes |
| Managing agent | Assigned portfolio and full operational record | Configure terms, acknowledge and triage requests, invite contractors, coordinate, remind, export | Confirm money received as the landlord unless explicitly delegated |
| Tenant representative | Tenant-visible record for assigned tenancy | Submit or update information on behalf of tenant | Act invisibly; every action must identify the representative |
| Contractor guest | One invited job | Submit quote, propose appointment, add completion evidence and invoice | Browse the tenancy, parties, other jobs or rent |
| Administrator | Product operations | Manage access, investigate delivery failures, revoke sessions and inspect audit events | Silently alter original user evidence |

### Acting on behalf of someone

An entry made by a representative renders as:

> Submitted by Mei Lin Tan, tenant representative, on behalf of Alex Lim.

The represented person can view, comment on and acknowledge the entry. The
original actor is never rewritten.

## Information architecture

### Unauthenticated

| Route | Purpose |
|---|---|
| `/` | Private product introduction with sign-in, not a lead-generation page |
| `/sign-in` | Passwordless email login |
| `/invite/[token]` | Accept an invitation and confirm the tenancy role |
| `/job/[token]` | Expiring contractor access to one job |
| `/privacy` | Product-specific privacy notice |
| `/help` | Short help and emergency guidance |

### Authenticated shell

| Route | Purpose |
|---|---|
| `/home` | Role-aware action dashboard |
| `/portfolio` | Agent or multi-property landlord portfolio |
| `/tenancies/[id]` | Tenancy overview |
| `/tenancies/[id]/rent` | Monthly rent history |
| `/tenancies/[id]/requests` | Requests and repairs |
| `/tenancies/[id]/servicing` | Recurring obligations |
| `/tenancies/[id]/condition` | Move-in and move-out reports |
| `/tenancies/[id]/documents` | Receipts, invoices and exports |
| `/tenancies/[id]/activity` | Complete chronological record |
| `/settings/profile` | Name and notification preferences |
| `/settings/access` | Memberships and active sessions |
| `/admin` | Product operations for authorised administrators |

### Primary navigation

On phones, use no more than five persistent destinations:

1. Home
2. Tenancy or Portfolio
3. Requests
4. Activity
5. More

The current tenancy remains visible in the page header. Switching tenancy is a
deliberate action, not an invisible filter.

## Screen specifications

### Agent portfolio

The first view for Shervin and his partner.

#### Summary

- Active tenancies
- Actions due today
- New tenant requests
- Approvals waiting for landlords
- Unconfirmed rent records
- Servicing due in the next 30 days
- Tenancies approaching expiry

#### Action queue

Every row shows:

- Property
- Matter
- Current status
- Responsible person
- Next action
- Due date
- Time since last activity

Sorting prioritises overdue actions, then due today, then newest matters. A
matter that cannot be measured is labelled as unavailable, not safe.

### Landlord home

The landlord should answer these questions without opening a detail page:

1. What requires my attention?
2. What is currently being handled?
3. What money has been confirmed?
4. What obligation is approaching?
5. What was recently completed?

Sections:

- Action required
- Rent this month
- Open requests
- Upcoming servicing
- Recent activity
- Documents and reports

### Tenant home

Sections:

- Next rent date
- Report a problem
- Open requests and their next actions
- Upcoming servicing
- Condition report tasks
- Recent documents

The main action is **Report a problem**. The tenant must not search through a
menu to find it.

### Tenancy overview

- Property identity and tenancy dates
- Participants and roles
- Confirmed operational terms
- Rent state
- Open requests
- Recurring obligations
- Condition report state
- Last five activity events
- Export tenancy record

### Request detail

The page is a shared case file:

- Plain-language issue summary
- Current state
- Responsible person
- Next action and due date
- Safety guidance when applicable
- Original report and attachments
- Conversation tied to the matter
- Quote and approval history
- Appointment
- Completion evidence
- Acknowledgements
- Permanent event timeline

Comments never replace structured actions. For example, writing “approved” in
a comment does not approve a quote; the landlord must use the approval action.

## Workflow state machines

### Rent

```text
UPCOMING
  -> DUE
  -> MARKED_SENT
  -> CONFIRMED_RECEIVED

Any active state
  -> FOLLOW_UP_REQUIRED
  -> RESOLVED
```

Rules:

- A rent cycle is generated from the configured due date.
- The tenant or tenant representative marks it sent and may attach a reference.
- Only the landlord or a recorded delegate confirms receipt.
- Marked sent never renders as received.
- A disagreement preserves both parties' assertions.
- No late fee or legal conclusion is calculated automatically.

### Request and repair

```text
SUBMITTED
  -> ACKNOWLEDGED
  -> REVIEWING
  -> QUOTE_REQUESTED
  -> AWAITING_APPROVAL
  -> APPROVED
  -> SCHEDULED
  -> WORK_COMPLETED
  -> AWAITING_ACKNOWLEDGEMENT
  -> CLOSED

Possible branches
  -> MORE_INFORMATION_REQUIRED
  -> REJECTED
  -> CANCELLED
  -> REOPENED
```

Required controls:

- Every state change records actor, timestamp and reason.
- Each active state has one responsible role and one next action.
- A changed price or scope creates a new quote version and approval.
- Completion by a contractor is not the tenant's acknowledgement.
- Reopening preserves the previous completion event.
- Fixed emergency instructions appear before the ordinary workflow for hazards.

### Recurring servicing

```text
UPCOMING
  -> DUE
  -> BOOKED
  -> SERVICE_RECORDED
  -> ACKNOWLEDGED
  -> NEXT_OCCURRENCE_CREATED
```

Rules:

- Frequency comes from the confirmed tenancy terms.
- Tenant, representative or agent may upload the receipt.
- The record contains service date, provider, equipment, invoice and evidence.
- Missing evidence is labelled missing; it is not treated as completed.

### Condition report

```text
DRAFT
  -> SHARED
  -> LANDLORD_ACKNOWLEDGED
  -> TENANT_ACKNOWLEDGED
  -> FROZEN

FROZEN
  -> CORRECTION_PROPOSED
  -> NEW_VERSION
```

Rules:

- Organise by room, then item.
- Record condition, note, image, author and timestamp.
- A frozen version is never overwritten.
- Both parties can add a qualification when acknowledging.
- Move-out is a new report linked to move-in, not an edit of move-in.

## Notification policy

Start with email and in-app notifications.

### Immediate

- New request submitted
- Safety category selected
- Quote ready for approval
- Appointment changed
- Contractor marks work completed
- Access removed

### Scheduled

- Rent approaching
- Rent due
- Rent still awaiting confirmation
- Servicing approaching
- Servicing evidence due
- Tenancy approaching expiry

### Digest

Agents receive one daily action digest rather than separate reminders for every
ordinary status change.

Every notification includes:

- Property identifier
- Matter
- Required action
- Due date, if any
- Secure deep link
- Notification reason

Operational notification settings remain separate from any marketing consent.

## Contractor guest experience

A contractor should not need an account for the first pilot.

The expiring job link shows only:

- Service address
- Scoped issue
- Necessary photographs
- Access contact and available times
- Quote form
- Appointment response
- Completion form

The quote requires:

- Call-out fee
- Labour
- Materials
- GST
- Total
- Inclusions
- Exclusions
- Validity
- Available dates
- Warranty
- Licence or credential where relevant

The final invoice is compared with the approved total. A difference requires a
recorded explanation and landlord acknowledgement.

## Core data model

Identifiers are opaque UUIDs. Every table includes `created_at`; mutable
records also include `updated_at`. Times are stored in UTC and displayed in
Asia/Singapore.

| Entity | Essential fields |
|---|---|
| `profiles` | user id, display name, email, status |
| `properties` | id, public Truestorey property reference, display address, property type |
| `tenancies` | property id, start, end, status, timezone |
| `memberships` | tenancy id, profile id, role, invited by, accepted at, revoked at |
| `operational_terms` | tenancy id, rent amount, due rule, grace note, repair threshold, servicing frequency, effective version |
| `rent_cycles` | tenancy id, period, amount due, due date, current state |
| `payment_assertions` | rent cycle id, actor, assertion type, date, reference, attachment |
| `obligations` | tenancy id, type, responsible role, recurrence, next due, state |
| `condition_reports` | tenancy id, kind, version, state, frozen at |
| `condition_items` | report id, room, item, condition, note, author |
| `requests` | tenancy id, category, summary, description, state, owner, next action, due date |
| `request_events` | request id, actor, event type, previous state, new state, note |
| `quotes` | request id, provider, version, line items, total, validity, state |
| `approvals` | quote id, actor, decision, reason, timestamp |
| `appointments` | request id, provider, start, end, access note, state |
| `documents` | tenancy id, related entity, kind, private storage path, original name, content type, size, uploaded by |
| `provider_invites` | request id, token hash, expires at, revoked at, last accessed at |
| `notification_events` | user, channel, template, related entity, scheduled, sent, delivery state |
| `audit_events` | actor, tenancy, action, target, timestamp, request metadata |

Current status may be cached for fast display, but the underlying event history
is the durable record.

## Permission invariants

These are tests, not merely policy statements:

- A tenant cannot read another tenancy by changing a URL.
- A landlord cannot read another landlord's property.
- An agent sees only assigned tenancies.
- A tenant representative's action always records the representative.
- A contractor token reveals one job and expires.
- A revoked membership immediately loses access, including existing sessions.
- A copied private document link expires and cannot bypass membership checks.
- A viewer cannot export unless the role has export permission.
- Browser code never receives a service-role credential.
- An administrator action appears in the audit history.

## Technical architecture

### Recommended stack

- Next.js App Router
- React
- TypeScript in strict mode for roles, permissions and workflow states
- Supabase Auth
- Supabase Postgres with row-level security
- Supabase private Storage
- Resend for transactional email
- Vercel for deployment and scheduled jobs
- Plain CSS using Truestorey design tokens
- Node's built-in test runner where practical

This application may require more dependencies and stronger typing than the
public site, but each choice must have a clear operational reason. TypeScript
is a deliberate exception to the public site's architecture because incorrect
roles and workflow states can expose private data or misstate an action. Do not
copy the public site's three-dependency rule blindly into a private
authenticated application.

### Project separation

| Concern | Public Truestorey | Truestorey Manage |
|---|---|---|
| Repository | `truestorey` | `truestorey-manage` |
| Vercel project | Existing live project | Separate project |
| Domain | Public domain | `manage` subdomain |
| Supabase | Public-site services | Separate project and keys |
| Users | No account required for public tools | Invite-only accounts |
| Data | Public and sourced property data | Private tenancy data |
| Deploy | Existing master deployment | Independent deployment |

### Data connection

The private app may read a small, stable public property record by identifier.
It must not import the full public dataset or create a reverse path from private
events into the public site.

```text
Public property record
        |
        | property identifier + sourced public context
        v
Private tenancy workspace

No tenant, payment, request, image or activity data flows back.
```

## Interface direction

Truestorey Manage is operational, calm and precise. It should feel like the
same institution as Truestorey without copying the public site's editorial
page layouts.

### Keep

- Warm ground `#F6F5F2`
- Deep teal `#164F52` for interface structure and actions
- Light teal `#58BCC3` only for live or selected data
- Archivo semi-condensed headings
- Source Sans 3 body copy
- IBM Plex Mono for dates, identifiers, money and states
- Small deliberate radii
- Green and red reserved for their existing meanings
- Warning colour for unavailable or unresolved information

### Interaction rules

- Mobile first from 375px upward
- Minimum 44 by 44px touch targets
- Visible keyboard focus
- Persistent text labels; no unexplained icon-only actions
- Status never communicated by colour alone
- No horizontal scrolling for core forms or tables
- Forms use visible labels and errors beside the field
- Save feedback is immediate and specific
- Destructive actions require a clear target and confirmation
- Motion only explains a state transition and respects reduced motion
- The unanimated state is always complete
- No decorative property photography inside the operational workspace

The generic luxury-property serif and blue-teal palette suggested by an
automated design search were rejected because they conflict with Truestorey's
established identity and would make the private app feel like an unrelated
portal.

## Pilot fixtures

Before real client data, seed a fictional tenancy:

- Landlord: Jordan Tan
- Tenant: Alex Lim
- Managing agents: Shervin Poh and partner
- Tenant representative: Mei Lin Tan
- Property: a clearly fictional Singapore address
- Rent due on the first of each month
- Quarterly air-conditioning servicing
- One existing move-in defect
- One new leaking-tap request
- Two contractor quote versions

The same fixture drives screenshots, demonstrations and automated workflow
tests. Do not place real client data in development or preview deployments.

## Delivery plan

### Phase 0 · Foundation decisions

Deliverables:

- Final name and subdomain
- New repository and hosting project
- `AGENTS.md`
- Environment variable inventory
- Role and permission matrix
- State-machine tests written before UI implementation
- Fictional pilot fixture

Exit condition: the system can explain who may see and change every record.

### Phase 1 · Clickable working shell

Deliverables:

- Responsive authenticated shell using fictional data
- Agent portfolio
- Landlord home
- Tenant home
- Tenancy overview
- Request detail
- Mobile navigation

Exit condition: Shervin and partner can walk through all roles and understand
the next action on every screen without explanation.

### Phase 2 · Identity and tenancy access

Deliverables:

- Passwordless invitation
- Tenancy memberships
- Row-level security
- Session revocation
- Private file storage
- Permission regression tests

Exit condition: the permission-invariant suite passes and deliberate cross-
tenancy access attempts fail.

### Phase 3 · First complete repair journey

Deliverables:

- Tenant report
- Agent acknowledgement and review
- Contractor guest quote
- Landlord approval
- Appointment
- Completion evidence
- Tenant acknowledgement or reopen
- Shared timeline and notifications

Exit condition: the fictional leaking-tap matter completes end to end without
using an external chat.

### Phase 4 · Rent, servicing and condition

Deliverables:

- Rent cycles and dual acknowledgement
- Recurring servicing and receipt evidence
- Versioned condition reports
- Documents and exports
- Agent daily action digest

Exit condition: one simulated quarter completes with a coherent export.

### Phase 5 · Personal pilot

Use two to five tenancies managed by Shervin and partner for at least one full
air-conditioning quarter.

Measure:

- Both parties activated
- Rent state correct two days after due date
- Time to first human response
- Open matters with an owner and next action
- Servicing evidence acknowledged by its configured deadline
- Side-channel messages required to complete a workflow
- Agent minutes per active tenancy
- Reopened repairs
- Notification delivery failures

Do not set success thresholds until the first two weeks establish a baseline.

## MVP acceptance checklist

The pilot is ready only when:

- Every role has been exercised in the fictional tenancy.
- Every active request has an owner and next action.
- Every state change has an actor and timestamp.
- Rent marked sent cannot appear as landlord-confirmed.
- Quote revisions cannot inherit an earlier approval.
- A frozen condition report cannot be overwritten.
- A contractor cannot enumerate other work.
- A revoked member loses access immediately.
- Missing notification delivery is visible to the agent.
- Private files cannot be opened through permanent public URLs.
- The complete tenancy record exports without unsupported conclusions.
- The product works at 375px, 768px, 1024px and 1440px.
- Keyboard navigation, focus, contrast and reduced motion have been tested.

## Instructions for the implementation agent

Before changing code, the implementation agent must:

1. Read this blueprint and the new repository's `AGENTS.md` completely.
2. Inspect the current code and test state.
3. State the one milestone being attempted and its acceptance criteria.
4. Preserve the project separation and permission invariants.
5. Use fictional data until the personal-pilot release is explicitly approved.
6. Build the smallest complete vertical journey before adding adjacent modules.
7. Verify behaviour at the database boundary, not only in the interface.
8. Render and inspect each changed screen at the required responsive widths.
9. Run the full relevant test suite.
10. Report what remains unverified or unavailable.

The first implementation milestone is **Phase 0 followed by the fictional-data
working shell in Phase 1**. Do not connect Supabase, collect client data or
deploy a production service before that shell is approved.
