
---
name: ui-design
description: Use this skill whenever designing, implementing, reviewing, or improving the Carbon Management Platform's frontend, visual identity, design system, dashboards, forms, tables, navigation, responsive layouts, accessibility, or user interactions.
---

# UI Design

## When to use

Use this skill whenever designing, implementing, reviewing, or improving any user-facing part of the Carbon Management Platform.

This includes:

- Application layouts, navigation, sidebars, headers, and dashboards.
- Organisation, facility, asset, and flare-source management screens.
- Gas-flaring activity data entry and review interfaces.
- Emissions calculation and emission-factor management screens.
- Evidence upload and document management interfaces.
- Review, approval, and correction workflows.
- Reports, analytics, charts, and data visualisations.
- Mitigation management interfaces.
- Authentication, onboarding, organisation setup, and user management.
- Reusable components, design tokens, typography, spacing, and interaction patterns.
- Responsive layouts for desktop, laptop, tablet, and mobile devices.
- UI accessibility, usability, and design-system consistency.

The platform must maintain one coherent visual identity. Individual pages must not look like unrelated applications.

The desired visual direction is a **futuristic, premium enterprise carbon-management platform**.

The interface should feel:

- Modern and technologically advanced.
- Environmentally grounded.
- Analytical and intelligent.
- Precise and trustworthy.
- Professional enough for enterprise use.
- Comfortable for extended daily use.

Use colour psychology deliberately. Keep animation minimal. Create visual interest through composition, hierarchy, typography, colour, and refined interactions rather than excessive decoration.

The initial product is the enterprise carbon-management platform. The carbon-credit marketplace is a future, separately scoped module. Do not introduce marketplace screens or functionality into the initial product unless explicitly requested.

## Instructions

### 1. Inspect the existing project before designing

Before creating or modifying UI:

1. Read the root `CLAUDE.md`.
2. Inspect the existing frontend directory structure.
3. Inspect the relevant routes, pages, layouts, components, and hooks.
4. Inspect the existing Tailwind and shadcn/ui configuration.
5. Check the installed versions of relevant dependencies.
6. Identify existing design tokens, reusable components, and established conventions.
7. Understand the user workflow and data being displayed.
8. Determine whether the requested change is local to one component or affects the shared design system.

Do not assume a dependency is installed because it is commonly used.

Do not introduce a new UI library, animation library, icon library, charting library, or styling framework without inspecting the existing project and establishing that the addition is necessary.

Use the established project stack:

- React.
- Vite.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- React Router.
- TanStack Query.
- React Hook Form.
- Zod.

Do not introduce Next.js, Next.js Server Components, or another frontend framework.

Do not replace existing project architecture merely to implement a visual improvement.

### 2. Establish the visual identity

The platform must look like a premium environmental intelligence system, not a generic administration template.

The design direction combines:

- Premium enterprise software.
- Modern climate and environmental technology.
- Clean operational interfaces.
- Precise data visualisation.
- Subtle futuristic details.
- Natural, environmentally grounded colours.
- Strong information hierarchy.
- Generous but purposeful spacing.
- Refined and predictable interactions.

The visual identity must communicate five qualities:

**Trust**

Users are managing important organisational, operational, and environmental records. The interface must communicate reliability and accountability.

**Clarity**

Complex emissions information, technical measurements, and approval workflows must be easy to understand.

**Intelligence**

The platform should feel analytical and technically capable without relying on unnecessary visual effects.

**Responsibility**

The environmental purpose should be reflected in the brand identity and presentation of information.

**Control**

Users must understand the status of records, calculations, submissions, reviews, approvals, and mitigation actions.

Avoid generic dashboards that look like unmodified admin templates.

Avoid:

- Excessive gradients.
- Glowing borders.
- Glassmorphism as a default design treatment.
- Oversized rounded cards.
- Decorative blobs.
- Unnecessary background illustrations.
- Excessive shadows.
- Random colour combinations.
- Unnecessary icons.
- Excessive card nesting.
- Visual effects that compete with operational information.

Use futuristic styling selectively. Professional usability takes priority over visual novelty.

### 3. Use the approved brand palette

The following six colours are the approved brand palette for the entire platform.

Do not introduce a competing brand palette.

| Colour | Hex | Primary purpose |
|---|---|---|
| Forest | `#0F2A1D` | Brand identity, navigation, dark surfaces, strong text |
| Moss | `#375534` | Primary actions, interactive elements, important accents |
| Sage | `#6B9071` | Supporting accents, charts, informational elements |
| Light Sage | `#AEC3B0` | Borders, dividers, muted surfaces |
| Mint | `#E3EED4` | Soft backgrounds, selected states, subtle highlights |
| Amber Gold | `#9A803A` | Pending states, attention indicators, important notices |

#### Forest — confidence and authority

Use Forest for:

- Brand identity and logo treatments.
- Sidebar and navigation surfaces where appropriate.
- Strong headings and important text.
- Dark visual sections.
- High-emphasis brand elements.

Forest should establish the platform's identity without making every screen excessively dark.

#### Moss — action and stability

Use Moss for:

- Primary buttons.
- Important interactive elements.
- Active navigation indicators.
- Selected controls where appropriate.
- Primary chart series where suitable.

Moss should communicate purposeful action and reliability.

#### Sage — balance and environmental intelligence

Use Sage for:

- Secondary chart series.
- Supporting data visualisations.
- Secondary accents.
- Informational highlights.
- Supporting interface elements.

Use Sage to reinforce the environmental identity without overwhelming the interface.

#### Light Sage — calm and structure

Use Light Sage for:

- Subtle borders.
- Dividers.
- Muted surfaces.
- Secondary visual elements.
- Low-emphasis interface details.

Do not use Light Sage for text where contrast is insufficient.

#### Mint — openness and environmental purpose

Use Mint for:

- Soft section backgrounds.
- Selected or highlighted areas.
- Subtle informational surfaces.
- Low-intensity hover states.
- Supporting dashboard sections.

Mint should provide visual breathing space.

#### Amber Gold — attention and caution

Use Amber Gold sparingly for:

- Pending review indicators.
- Important notices.
- Attention-required states.
- Selected warnings and supporting highlights.

Do not use Amber Gold as a general-purpose primary colour.

#### Palette application rules

- Maintain a predominantly calm and readable interface.
- Use Forest and Moss to establish the primary visual identity.
- Use Sage and Mint to provide supporting environmental character.
- Use Light Sage to create structure without excessive contrast.
- Reserve Amber Gold for meaningful attention states.
- Avoid using all six colours with equal prominence on one screen.
- Do not use colour alone to communicate status.
- Pair important status colours with labels, icons, or descriptive text.
- Use accessible foreground and background combinations.
- Derive lighter or darker variants only when necessary for accessibility or component states.

Neutral colours may be used for readable text, backgrounds, and contrast. They must support the approved palette rather than replace it.

### 4. Centralise the design system

The brand palette must be implemented consistently across the application.

Before changing theme configuration:

1. Inspect the existing Tailwind configuration and CSS entry points.
2. Inspect the current shadcn/ui theme and CSS-variable conventions.
3. Determine how the installed Tailwind version handles theme tokens.
4. Extend the existing system rather than introducing a competing one.

Establish semantic tokens for the interface, including:

- Background.
- Foreground.
- Card.
- Card foreground.
- Popover.
- Popover foreground.
- Primary.
- Primary foreground.
- Secondary.
- Secondary foreground.
- Muted.
- Muted foreground.
- Accent.
- Accent foreground.
- Destructive.
- Border.
- Input.
- Ring.
- Sidebar and navigation roles where needed.

Map the approved palette to appropriate semantic roles.

Do not assume every semantic role must use one of the six brand colours directly. For example, destructive feedback and accessibility states may require suitable semantic colours.

Use the existing project conventions when implementing these tokens.

Do not repeatedly hardcode brand hex values inside individual components.

Do not create separate colour definitions for individual pages.

Also maintain consistent conventions for:

- Typography.
- Spacing.
- Border radii.
- Shadows.
- Component heights.
- Button sizes.
- Form controls.
- Table density.
- Focus indicators.
- Interaction transitions.

Where useful, define reusable component variants rather than implementing slightly different versions of the same component across multiple pages.

### 5. Typography and information hierarchy

Use a modern, professional, highly readable typography system.

Establish a consistent hierarchy for:

- Page titles.
- Section headings.
- Card headings.
- Primary metrics.
- Supporting metrics.
- Form labels.
- Body text.
- Helper text.
- Table content.
- Status labels.
- Metadata.
- Timestamps.

Guidelines:

- Use a consistent font family and weight scale.
- Avoid excessive font sizes and font weights.
- Use tabular numerals for operational and emissions metrics where supported.
- Make important measurements easy to scan.
- Maintain comfortable line heights.
- Avoid excessively small text.
- Ensure long organisation names, facility names, and technical descriptions do not break layouts.
- Use consistent formatting for dates, quantities, units, and numerical values.

A dashboard metric such as total tCO2e should have clear visual prominence.

Its reporting period, measurement scope, unit, and approval status must remain visible.

Do not use typography alone to imply that a preliminary figure is approved.

### 6. Application layout and component consistency

Use a coherent application shell across the platform.

The application should have:

- Consistent navigation.
- A predictable sidebar or navigation structure.
- Consistent page headers.
- Clear page titles and contextual descriptions.
- Predictable content widths.
- Reusable card and panel patterns.
- Consistent form layouts.
- Consistent table structures.
- Consistent dialog behaviour.
- Consistent spacing and alignment.
- Clear separation between primary and secondary actions.

Avoid placing every piece of information inside a card.

Use cards only when they establish meaningful grouping or hierarchy.

Avoid excessive nesting of cards and panels.

Use whitespace to improve comprehension, not to waste screen space.

Use tables when users need to compare, filter, or manage structured operational records.

Do not force complex tabular data into decorative cards.

Do not create a new component when an existing reusable component already serves the purpose.

### 7. Dashboard design

The dashboard should feel like a professional carbon-intelligence workspace.

Relevant dashboard information includes:

- Total gas flared.
- Average flare rate.
- CO2 emissions.
- CH4 emissions.
- Total tCO2e.
- Facility and flare-source breakdowns.
- Emissions trends.
- Pending submissions.
- Records awaiting review or approval.
- Data-quality warnings.
- Outstanding mitigation actions.

Design principles:

1. Establish a clear hierarchy between key metrics and supporting information.
2. Make reporting periods and measurement units visible.
3. Distinguish organisation-level, facility-level, and flare-source-level information.
4. Use charts only when they communicate useful information.
5. Avoid decorative charts with no analytical purpose.
6. Provide useful empty states when an organisation has no records.
7. Show loading and error states.
8. Distinguish preliminary data from approved reporting data.
9. Do not invent dashboard figures.
10. Do not use hardcoded placeholder values that appear to be genuine organisational data.
11. Make data-quality warnings visible without making the dashboard unnecessarily alarming.
12. Make navigation from summary metrics to relevant detailed records intuitive.

#### Dashboard metric presentation

When presenting emissions or operational metrics, show relevant context:

- Metric name.
- Numerical value.
- Unit.
- Reporting period.
- Organisational or facility scope.
- Data status where applicable.

Do not display a number without enough context for users to interpret it correctly.

#### Chart design

Charts must have:

- Meaningful titles.
- Clearly labelled axes.
- Appropriate units.
- Readable legends.
- Relevant reporting periods.
- Understandable tooltips.
- Consistent colour usage.
- Empty and loading states.

Do not use 3D charts or decorative visualisations that reduce clarity.

Use the approved palette for chart series while ensuring that series remain distinguishable.

Do not imply that a chart represents approved emissions when it includes preliminary or pending records.

### 8. Data-entry and operational forms

Operational forms must prioritise accuracy, clarity, and ease of use.

This is particularly important for gas-flaring activity records.

Forms should:

- Group related fields logically.
- Use clear labels and appropriate input types.
- Display units beside measurement fields.
- Explain technical fields where necessary.
- Display validation errors close to the relevant fields.
- Distinguish required and optional information.
- Preserve user input when validation fails.
- Prevent accidental duplicate submissions.
- Provide clear saving, success, and failure feedback.
- Work properly on smaller screens.

For gas-flaring records, make the distinction between:

- Routine flaring.
- Non-routine flaring.
- Emergency flaring.
- Venting.
- Other gas releases.

Do not present venting as an ordinary flaring activity.

Where a measurement unit is selected, ensure there is no ambiguity about the value being entered.

Do not hide essential measurement units in tooltips.

Where relevant, provide clear explanations for:

- Measurement methods.
- Estimated values.
- Reporting periods.
- Measurement reference conditions.
- Required technical inputs.
- Missing evidence.
- Data-quality warnings.

If a measurement is estimated, make the explanation requirement clear.

Use React Hook Form and Zod according to the existing project conventions.

Do not implement authoritative emissions calculations in the frontend. The backend calculation engine remains responsible for validated calculations.

### 9. Tables, filters, and operational workflows

The platform will contain substantial operational data.

Design tables and data-management screens for practical daily use.

Include where appropriate:

- Search.
- Filters.
- Sorting.
- Pagination.
- Clear column headings.
- Status indicators.
- Row-level actions.
- Bulk actions only where justified.
- Empty states.
- Loading states.
- Error states.
- Responsive behaviour.

Avoid overcrowded tables.

Use appropriate column widths and consistent alignment.

Align numerical values consistently and make units clear.

On smaller screens, provide an appropriate responsive alternative rather than shrinking every column until the content becomes unreadable.

Possible alternatives include:

- A controlled horizontal-scroll region.
- A reduced set of priority columns.
- A responsive record-list layout.
- A detail view for less frequently used information.

Choose the approach that best supports the workflow.

Use consistent status labels where applicable:

- Draft.
- Submitted.
- Under Review.
- Needs Correction.
- Awaiting Approval.
- Approved.
- Superseded.
- Withdrawn.

Do not make a record appear approved merely because it has been submitted.

### 10. Review, approval, and evidence interfaces

Review and approval screens must communicate accountability and traceability.

Make it easy for users to identify:

- Who submitted a record.
- When it was submitted.
- Who reviewed it.
- Its current status.
- Outstanding corrections.
- Reviewer comments.
- Approval history.
- Supporting evidence.
- Relevant calculation versions.

Use clear visual separation between:

1. Submitted information.
2. Validation feedback.
3. Reviewer feedback.
4. Correction history.
5. Approval actions.
6. Historical activity.

Do not make destructive or irreversible actions look like ordinary primary actions.

Do not allow the interface to imply that a user has permission to approve a record when the backend has not authorised that action.

The UI must respect separation of duties.

A submitter must not approve their own submission.

The backend remains the authority for permissions and approval eligibility.

Evidence interfaces should show relevant information, including:

- File name.
- File type.
- File size where useful.
- Upload status.
- Uploading user where appropriate.
- Upload date.
- Evidence description.
- Related record.

Do not expose private object-storage URLs or sensitive file information unnecessarily.

### 11. Interaction and component states

Every interactive component must have clearly designed states.

Consider the following states wherever relevant:

- Default.
- Hover.
- Focus.
- Active.
- Selected.
- Disabled.
- Loading.
- Success.
- Error.
- Empty.
- Permission-restricted.

Do not implement controls that appear interactive but have no meaningful action.

Buttons must communicate their purpose clearly.

Use appropriate button variants for:

- Primary actions.
- Secondary actions.
- Tertiary actions.
- Destructive actions.
- Icon-only actions.

Do not make multiple unrelated actions appear equally important.

Important actions should be easy to identify.

Destructive actions should require appropriate confirmation where necessary.

For dialogs:

- Provide clear titles and descriptions.
- Use predictable close behaviour.
- Prevent accidental dismissal where unsaved changes could be lost.
- Ensure keyboard accessibility.
- Make dialogs usable on smaller screens.

Provide immediate and understandable feedback for important user actions.

### 12. Animation and interaction philosophy

Animation must be minimal, purposeful, and restrained.

The platform should feel alive without constantly moving.

Use animation only when it improves the user's understanding of an interaction or provides useful feedback.

Appropriate examples:

- Subtle hover transitions on buttons.
- Gentle changes in navigation selection.
- Short fade or opacity transitions.
- Small loading indicators.
- Smooth but restrained dialog and dropdown transitions.
- Subtle chart entrance transitions where useful.
- Clear visual feedback when a user selects an item.

Avoid:

- Constantly moving backgrounds.
- Animated gradients.
- Floating decorative objects.
- Excessive parallax.
- Large page-entry animations.
- Bouncing or pulsing elements without a functional reason.
- Repeated attention-grabbing effects.
- Long transitions that delay interaction.
- Animations that interfere with reading tables or metrics.

Prefer simple opacity, colour, and small transform changes.

Respect the user's `prefers-reduced-motion` setting.

Essential information and functionality must never depend on animation.

The interface must remain visually complete and fully usable when animations are disabled.

### 13. Responsive design

Design for:

- Desktop monitors.
- Laptops.
- Tablets.
- Smartphones.

Desktop should provide an efficient enterprise workspace.

Tablet layouts should preserve access to important operational actions.

Mobile layouts should prioritise readability, navigation, and essential tasks.

Guidelines:

- Avoid unintended horizontal overflow.
- Use responsive grids.
- Make forms comfortable to complete on touch devices.
- Ensure interactive targets are sufficiently large.
- Adapt navigation appropriately.
- Reflow dashboard metrics without losing hierarchy.
- Provide sensible alternatives for wide data tables.
- Keep dialogs usable on smaller screens.
- Preserve essential warnings and status information.
- Do not hide critical actions simply to save space.

Test important layouts at multiple viewport widths.

Do not assume that a desktop layout will work on mobile without modification.

### 14. Accessibility and usability

Follow accessible interface practices.

- Use semantic HTML.
- Maintain sufficient colour contrast.
- Provide visible keyboard focus states.
- Associate form labels with their controls.
- Use accessible dialog and menu behaviour.
- Provide meaningful accessible names for icon-only buttons.
- Do not communicate status through colour alone.
- Ensure keyboard navigation works.
- Respect reduced-motion preferences.
- Make validation errors understandable.
- Use appropriate heading hierarchy.
- Provide accessible feedback for asynchronous actions.
- Avoid unnecessarily complicated interaction patterns.

Do not sacrifice accessibility for visual effects.

### 15. Icons and visual assets

Use the icon library already installed in the project.

Prefer the existing Lucide-based conventions if available.

Use icons consistently and purposefully.

Avoid:

- Mixing unrelated icon styles.
- Using emojis as interface icons.
- Adding icons to every label.
- Using decorative icons that do not improve comprehension.
- Using icons without accessible labels where necessary.

Use illustrations only when they serve a genuine purpose, such as a meaningful empty state or onboarding explanation.

Do not introduce large decorative illustrations that compete with operational information.

### 16. Frontend architecture and state

UI implementation must respect the existing frontend architecture.

- Use React components with TypeScript.
- Follow established folder and naming conventions.
- Use React Router for navigation.
- Use TanStack Query for server-state management.
- Use React Hook Form and Zod for forms.
- Reuse existing shadcn/ui components where appropriate.
- Keep components focused and maintainable.
- Avoid unnecessarily large page components.
- Keep business logic out of presentation components.
- Handle loading, error, success, and empty states.
- Avoid unnecessary duplicate API requests.
- Use the established API service and hook conventions.
- Do not treat frontend state as authoritative for permissions or data integrity.

Do not create mock data that could be mistaken for actual organisational emissions data.

If mock data is necessary during development:

- Label it clearly as sample or demonstration data.
- Keep it separate from real API responses.
- Do not present it as validated organisational information.
- Remove or clearly isolate it before production use.

Do not invent API endpoints or backend response fields to make a screen appear functional.

Inspect the existing API contracts before integrating a UI with backend data.

### 17. Environmental data presentation and integrity

The platform deals with technical environmental information. Visual presentation must not change the meaning of the underlying data.

Always distinguish:

- Gas flared from gas vented.
- Activity data from emissions.
- Individual gas emissions from total CO2e.
- tCO2e from carbon credits.
- Preliminary calculations from approved results.
- Estimated measurements from measured values.
- Missing evidence from validated evidence.
- A listed credit from an issued, transferred, delivered, cancelled, or retired credit.

Where relevant, display:

- Measurement units.
- Reporting periods.
- Data source or scope.
- Methodology.
- Calculation status.
- Approval status.
- Data-quality warnings.

Do not silently round values in a way that changes their interpretation.

Do not imply that an emissions reduction is caused by a mitigation action solely because emissions declined.

Do not claim that the platform issues, certifies, or independently verifies carbon credits.

The interface must communicate the status and limitations of information honestly.

### 18. Design implementation workflow

For every UI task:

1. Read the relevant project instructions.
2. Inspect the affected page, components, routes, hooks, and theme.
3. Understand the user workflow and the information the screen must communicate.
4. Identify reusable components and design tokens.
5. Plan the smallest coherent set of changes.
6. Implement the requested functionality using existing conventions.
7. Check responsive behaviour.
8. Check accessibility and interaction states.
9. Confirm loading, error, success, and empty states are handled.
10. Confirm that the UI does not misrepresent permissions, approvals, emissions, or carbon credits.
11. Run relevant frontend checks.
12. Resolve errors introduced by the changes.
13. Summarise the files changed and any remaining limitations.

Do not redesign unrelated pages when implementing a focused UI task.

Do not rewrite working components unnecessarily.

Do not introduce dependencies solely for cosmetic improvements.

When a change affects the global visual system, update shared design tokens or reusable components instead of creating page-specific workarounds.

When a task requires a significant design change, establish the page structure and visual hierarchy before writing extensive component code.

## Examples

### Example 1: Gas-flaring activity entry screen

**Input**

Design a gas-flaring activity entry screen for an organisation's facility.

Users must select a flare source, choose an activity type, enter a reporting period, provide a measured flare rate or volume, select a measurement method, and optionally attach evidence.

**Expected output**

Create a clean, premium operational form using the approved brand palette.

Group the fields into logical sections:

1. Facility and flare-source identification.
2. Activity type.
3. Reporting period.
4. Measurement data and units.
5. Measurement method and supporting explanation.
6. Evidence attachments.

Make units visible beside the relevant measurement fields.

Clearly distinguish flaring from venting.

Show validation feedback close to the relevant fields.

If a measurement is estimated, provide an explanation field.

Use a restrained primary action for saving or submitting.

Clearly indicate the record's current status.

Make the form responsive and usable on mobile devices.

Do not calculate or display an authoritative emissions result in the form unless it comes from the backend calculation service.

### Example 2: Carbon-intelligence dashboard

**Input**

Design an organisation dashboard displaying total gas flared, average flare rate, CO2 emissions, CH4 emissions, total tCO2e, facility-level comparisons, emissions trends, pending reviews, and data-quality warnings.

**Expected output**

Create a futuristic but professional carbon-intelligence dashboard.

Use:

- Forest for strong brand structure.
- Moss for primary actions.
- Sage for supporting chart series.
- Mint for subtle highlights.
- Light Sage for borders.
- Amber Gold for attention-required states.

Give key emissions metrics strong visual prominence.

Use meaningful charts with clearly labelled axes, measurement units, reporting periods, and data scope.

Separate approved reporting figures from preliminary or pending figures.

Use restrained transitions and subtle hover feedback.

Provide useful empty states when no operational data exists.

Do not invent emissions values, imply carbon-credit issuance, or present unapproved calculations as verified results.

### Example 3: Review and approval screen

**Input**

Design a review screen where an authorised reviewer can inspect a submitted gas-flaring activity record, review supporting evidence, identify validation warnings, request corrections, and forward an eligible record for approval.

**Expected output**

Create a clear review workspace that separates:

1. Submitted activity information.
2. Measurement details.
3. Supporting evidence.
4. Validation results.
5. Calculation information, where available.
6. Reviewer comments.
7. Available workflow actions.
8. Review history.

Make the current record status prominent.

Make correction requests and approval actions visually distinct.

Only display actions appropriate to the user's authorised role and workflow state.

Do not treat frontend visibility as proof of backend permission.

Preserve a clear history of previous review actions.

### Example 4: Operational records table

**Input**

Design a gas-flaring activity records page with search, filters, sorting, pagination, status indicators, and row-level actions.

**Expected output**

Create a practical enterprise data-management interface.

Prioritise:

- Readable column headings.
- Clear reporting periods.
- Visible measurement units.
- Consistent numerical alignment.
- Easily identifiable record statuses.
- Efficient filtering and search.
- Predictable row actions.
- Useful empty and loading states.

Provide a responsive alternative for smaller screens.

Avoid overcrowding the table or hiding important record information.

## Rules / Edge Cases

### Brand consistency

- The six approved palette colours are the brand foundation.
- Do not introduce an unrelated primary colour scheme.
- Centralise colour definitions.
- Use semantic design tokens.
- Maintain sufficient contrast.
- Use Amber Gold sparingly.
- Do not use colour alone to communicate meaning.
- Maintain consistent design patterns across all modules.

### Visual quality

- Prioritise clarity over decoration.
- Avoid generic administration-template styling.
- Avoid excessive cards, gradients, shadows, and rounded surfaces.
- Maintain consistent typography and spacing.
- Use charts only when they communicate meaningful information.
- Do not sacrifice usability for futuristic styling.

### Animation

- Minimal animation is the default.
- Every animation must have a clear purpose.
- Avoid continuous decorative movement.
- Keep interactions responsive.
- Respect reduced-motion preferences.
- The application must remain usable without animation.

### Technical boundaries

- Do not introduce Next.js.
- Do not use Next.js Server Components.
- Do not replace React, Vite, Tailwind, or shadcn/ui.
- Do not introduce a competing UI framework.
- Do not duplicate existing components unnecessarily.
- Do not introduce dependencies without justification.
- Do not put business logic in presentation components.
- Do not implement authoritative emissions calculations in the frontend.
- Do not invent API contracts or backend functionality.

### Data integrity and environmental claims

- Never fabricate emissions data, emission factors, GWP values, or calculation results.
- Never present sample data as real organisational data.
- Never label tCO2e as carbon credits.
- Never imply that the platform issues, certifies, or independently verifies carbon credits.
- Never present pending or unapproved records as approved.
- Never hide important data-quality warnings.
- Never imply that a user has approval permissions based only on frontend visibility.
- Never expose another organisation's records.
- Do not remove historical information or approval traceability from the interface.
- Do not silently change the meaning of measurements through formatting or rounding.

### Usability

- Do not sacrifice readability for futuristic styling.
- Do not overload dashboards with cards and charts.
- Do not use decorative charts without analytical value.
- Do not make essential actions difficult to find.
- Do not rely on hover alone to expose important functionality.
- Do not allow responsive layouts to introduce unintended horizontal overflow.
- Do not hide essential units, reporting periods, record statuses, or warnings.
- Do not make destructive actions visually indistinguishable from ordinary actions.
- Do not implement controls without meaningful behaviour.

**Final design principle:** The Carbon Management Platform should look like a premium, forward-looking environmental intelligence system: confident, precise, calm, technologically advanced, and trustworthy. Its visual sophistication must come from excellent composition, disciplined use of colour, typography, spacing, and subtle interaction—not excessive animation or decoration.
