
# Flare Calculator

## When to use

Use this skill whenever working on:

- Gas-flaring volume conversions or standardisation.
- Daily and reporting-period flare activity calculations.
- Greenhouse-gas emissions calculations from flaring.
- CO2 and CH4 emissions estimation.
- Combustion efficiency, oxidation assumptions, and gas-composition inputs.
- Emission-factor selection, approval, applicability, and versioning.
- Global Warming Potential (GWP) and tCO2e calculations.
- Venting and other gas-release calculations.
- Emissions calculation validation, auditability, and reproducibility.
- Carbon-credit eligibility discussions involving emissions data.
- Nigerian oil and gas emissions reporting requirements.

Load this skill before implementing or reviewing authoritative gas-flaring or gas-venting calculation logic. It supplements the root `CLAUDE.md`; it does not override the architecture, security, tenancy, or approval rules defined there.

## Instructions

### 1. Establish the activity and calculation boundary

Identify the activity type before selecting a calculation method:

- Routine flaring.
- Non-routine flaring.
- Emergency flaring.
- Venting.
- Other gas releases.

Flaring involves combustion. Venting involves release without combustion. They must not share the same calculation treatment by default.

Identify and retain the organisation, facility, asset, flare source, reporting period, measurement method, and applicable methodology. Confirm whether the requested output is an activity-volume result, a gas-specific emissions result, a CO2-equivalent result, or a regulatory report.

Keep these concepts distinct:

- Gas flared: gas sent to a flare and combusted.
- Gas vented: gas released without combustion.
- Activity data: measured or estimated operational quantities, such as gas rate or volume.
- Emissions: greenhouse gases released to the atmosphere.
- tCO2e: emissions expressed as carbon-dioxide equivalent.
- Carbon-credit eligibility: whether a project may qualify under a specific crediting programme and methodology.
- Issued carbon credits: units formally issued by the relevant programme or registry.

An activity-volume calculation is not an emissions calculation. An emissions calculation is not proof of credit eligibility or issuance.

### 2. Preserve measurement units and reference conditions

Use the project's preferred operational units unless an approved organisation configuration or source record specifies otherwise.

| Measurement | Preferred unit |
|---|---|
| Average flare rate | MMscf/d |
| Total gas volume | MMscf |
| Larger total gas volume | Bcf |
| Metric average rate | Sm³/d or MMSm³/d |
| Metric total volume | Sm³ or MMSm³ |

Initial reference conditions are:

- Temperature: 60°F.
- Pressure: 14.73 psia.

These are initial platform defaults, not universal assumptions. They must be configurable by organisation and the conditions applicable to each measurement must be recorded.

Always preserve:

- Original submitted measurement and precision.
- Original measurement unit.
- Original reference temperature and pressure, where applicable.
- Standardised measurement value and unit.
- Conversion method, formula, source, and assumptions.
- Conversion timestamp and responsible process or actor.

Do not convert between actual, standard, and normal cubic metres without identifying the applicable reference conditions and volume convention. Do not assume MMscf and Sm³ have a universal fixed conversion independent of reference conditions.

For gas-volume conversions, verify the temperature and absolute pressure basis, compressibility treatment where required, and the precise definition of the source unit. Do not silently treat gauge pressure as absolute pressure. If the available information is insufficient for a defensible conversion, preserve the source value and mark standardisation as blocked or unresolved.

Keep rate units and volume units dimensionally distinct. A rate such as MMscf/d cannot be stored or displayed as a total volume such as MMscf.

### 3. Validate activity data before calculating

Daily records may contain:

- Date or reporting-day boundaries.
- Average flare rate.
- Measurement unit.
- Optional total volume.
- Actual operating duration, where relevant.
- Measurement method.
- Optional evidence.

Reporting-period records may contain:

- Period start and end, including time zone or time convention where relevant.
- Average flare rate.
- Total volume.
- Measurement unit.
- Actual operating duration, where available.
- Measurement method.
- Optional evidence.

For a measured average rate, volume may be derived as:

`Gas volume = Average rate × Actual operating duration in days`

For example, if the rate is expressed in MMscf/d and the measured duration is 12 hours:

`Gas volume = MMscf/d × (12 / 24)`

Only use a 24-hour duration when the measurement actually represents a full day. Do not assume continuous operation, and do not infer actual operating duration from a reporting period unless the source data or approved methodology supports that inference.

Before calculation:

1. Check that values are numeric, finite, and within valid domain ranges.
2. Check that units are recognised and dimensionally appropriate.
3. Check that the activity type, flare source, and reporting period are identified.
4. Check that the measurement method is supplied.
5. Require an explanation for estimated measurements.
6. Require a description when the measurement method is `Other`.
7. Check consistency between duration, average rate, and total volume where the necessary inputs exist.
8. Flag potential overlapping periods for the same flare source.
9. Identify missing evidence as a data-quality warning.
10. Block calculation when required technical inputs or approved calculation configuration are missing.

Do not silently merge overlapping records, discard conflicting measurements, or treat missing readings as zero. Preserve the submitted values and create a validation issue or review task.

Evidence may be optional at initial submission if the product workflow permits it. Missing evidence must nevertheless remain visible and must not be represented as verified support.

### 4. Manage emission factors as traceable, versioned data

Never invent or hardcode an authoritative emission factor in application code.

Use the dedicated Emission Factor Management module as the source of factor records. Every factor version used in a calculation must be identifiable and traceable through:

- Factor identifier and version.
- Factor name.
- Numerical value and unit.
- Applicable gas or pollutant.
- Applicable activity type and calculation basis.
- Source organisation or publisher.
- Original publication or source document.
- Methodology and methodology version.
- Publication date.
- Effective or applicability date.
- Retrieval or ingestion date.
- Geographic, operational, and technical applicability conditions.
- Approval status and approval history.

Factor statuses include:

- Draft.
- Under Review.
- Approved.
- Superseded.
- Withdrawn.

Only approved, applicable factor versions may be used in approved calculations. A factor must match the activity, pollutant, measurement basis, units, methodology, geography, and relevant reporting period.

Do not combine factors with incompatible units, scopes, gas bases, or methodologies. Confirm whether a factor is expressed per unit of gas volume, energy, mass, or another activity basis before applying it. Perform and record any necessary unit conversion before multiplication.

A factor appearing in a publication or being entered into the database does not automatically make it approved for platform use. Approval must follow the application's governance process.

When an applicable factor changes:

- Preserve the previous factor version and its approval history.
- Do not alter historical calculations.
- Identify potentially affected calculations through an impact analysis.
- Do not automatically recalculate approved records.
- Recalculate only through an explicit new calculation version and authorised workflow.
- Preserve the exact factor version used by every calculation.

### 5. Select a documented methodology and its required inputs

Do not treat gas volume as emissions. Gas volume is activity data. Emissions require a suitable methodology, appropriate factor basis, and methodology-specific technical inputs.

Depending on the selected methodology and calculation route, relevant inputs may include:

- Gas composition and component fractions.
- Methane fraction.
- Carbon content.
- Heating value.
- Combustion or destruction efficiency.
- Oxidation assumptions.
- Gas-specific emission factors.
- Flare operating conditions.
- Applicable measurement and standardisation conditions.
- Uncertainty or measurement-quality information.

Do not assume these inputs or substitute generic values when they are unavailable. Require only the inputs that the selected methodology actually requires; do not make optional fields universally mandatory.

Where the methodology requires gas composition, combustion efficiency, or another technical input, block the affected calculation until valid inputs are supplied or an explicitly permitted, documented default or alternative method is selected. Any permitted default must itself have a traceable source, applicability conditions, version, and approval.

Keep CO2, CH4, and other greenhouse-gas emissions separately identifiable when the methodology supports them. Do not collapse gas-specific results prematurely into a single tCO2e number.

For a factor-based calculation, the general structure may be:

`Emissions = Activity data × Applicable emission factor`

This is valid only when the factor's unit, gas basis, activity basis, and methodology match the input. Confirm dimensional consistency and the resulting emissions unit before accepting the result.

For gas-specific emissions expressed in mass units:

`Gas emissions = Applicable activity data × Gas-specific emission factor`

Do not apply a factor already expressed in CO2e and then multiply by GWP again. That would double-count the CO2-equivalent conversion.

Do not assume one generic formula covers all flare technologies, gas compositions, combustion conditions, or methodologies. Implement the exact approved methodology and retain its formulae and assumptions.

### 6. Calculate CO2 equivalent using versioned GWP values

Use sourced and versioned Global Warming Potential values.

The general relationship is:

`tCO2e = Σ (Gas emissions in tonnes × Applicable GWP)`

For every GWP value, record:

- Gas.
- Numerical value.
- Source and assessment or publication.
- Assessment or publication version.
- Time horizon.
- Applicable methodology.
- Effective or applicable period.

An IPCC 100-year GWP approach may be considered initially, but the exact assessment/version and time horizon must be explicitly recorded and approved for the applicable methodology.

Never silently mix GWP values from different assessment versions or time horizons within one calculation. Confirm that gas emissions are expressed in compatible mass units before applying GWP.

### 7. Preserve calculation traceability and reproducibility

Every calculation must preserve enough information to reproduce the result:

- Exact activity-data inputs and source record identifiers.
- Original and standardised measurements.
- Units, reporting period, operating duration, and reference conditions.
- Conversion methods, formulae, and assumptions.
- Methodology identifier and version.
- Emission-factor identifiers, versions, values, units, and source references.
- GWP values, gases, sources, versions, and time horizon.
- Technical inputs and their provenance.
- Individual gas emissions.
- Total tCO2e.
- Calculation timestamp.
- Calculation-engine or formula version.
- Responsible user or process.
- Validation, quality, review, and approval status.

Use appropriate decimal precision and decimal-safe representations for accounting quantities. Avoid binary floating-point storage where exact decimal representation is required. Do not round intermediate values unnecessarily; round only at the appropriate reporting stage and according to the selected methodology or reporting specification.

Historical approved calculations must remain reproducible. A calculation is an immutable versioned record. Recalculation creates a new version linked to the prior calculation; it must not overwrite historical inputs, results, or factor references.

### 8. Respect validation, review, and reporting boundaries

A calculated result is not automatically an approved result. Follow the configured workflow and preserve the submitter, reviewer, approver, comments, correction requests, decisions, and timestamps.

A user must not approve their own submission. Only approved activity records may contribute to officially approved emissions reports. Preliminary dashboards may display pending, estimated, or unapproved data only when the status and limitations are clearly labelled.

Keep validation outcome, calculation outcome, and approval status distinct. For example, a record may pass input validation but still be awaiting a configured factor or methodology; a calculation may complete but remain pending review.

Do not allow a frontend display state to bypass backend calculation or approval controls.

### 9. Consider Nigerian regulatory requirements carefully

For Nigerian oil and gas use cases:

- Identify applicable requirements from the Nigerian Upstream Petroleum Regulatory Commission (NUPRC) where relevant.
- Verify current requirements against authoritative official publications before implementing them as rules.
- Check applicable legislation, regulations, guidelines, reporting instructions, and methodology documents.
- Record the document title, issuing authority, publication or version, relevant date, source location, and applicable scope.
- Confirm whether a requirement applies to the organisation, facility, activity, and reporting period.
- Distinguish regulatory reporting requirements from voluntary GHG accounting methodologies and corporate reporting frameworks.

Do not invent NUPRC reporting templates, mandatory field names, emission factors, submission formats, reporting deadlines, or compliance obligations.

Do not claim NUPRC compliance merely because a calculation or report has been generated. If the relevant current official source cannot be verified, mark the regulatory rule as unresolved and ask for the applicable source or confirmation.

### 10. Treat carbon-credit eligibility as a separate assessment

Emissions data may support a carbon-credit project assessment, but it does not by itself establish eligibility.

Any eligibility discussion must identify the relevant programme, methodology, project boundary, baseline, additionality requirements, monitoring requirements, safeguards, validation/verification requirements, and registry rules as applicable.

Distinguish:

- Estimated emissions reductions.
- Monitored and quantified reductions.
- Independently validated or verified reductions.
- Credits formally issued by a recognised programme or registry.

Do not convert a tCO2e result directly into an issued-credit balance. Do not claim that the platform independently validates, verifies, certifies, or issues credits. The marketplace, when implemented, is a separate transaction layer and does not replace programme or registry issuance.

### 11. Implement and test calculation logic safely

Before changing calculation logic:

1. Inspect the existing schema, factor-management module, methodology configuration, services, permissions, and tests.
2. Identify the activity type, flare source, and reporting period.
3. Confirm units, reference conditions, and actual operating duration.
4. Confirm required technical inputs and their provenance.
5. Confirm that the factor, methodology, and GWP versions are approved and applicable.
6. Implement authoritative calculations in the backend calculation service, not in React.
7. Persist all calculation inputs, factor references, methodology references, and outputs needed for reproduction.
8. Add tests for normal, boundary, invalid, missing-input, unit-conversion, and versioning cases.
9. Test tenant isolation and role permissions for factor approval and calculation actions.
10. Verify that historical calculations and approved records remain unchanged.

Keep unit conversion, input validation, factor selection, formula execution, result persistence, and approval transitions as clearly separated responsibilities where the existing architecture supports it. Do not introduce abstractions that obscure the methodology or make the calculation difficult to audit.

## Examples

### Example 1: Deriving gas volume from a measured operating duration

**Input**

- Activity: Routine flaring.
- Average flare rate: 0.25 MMscf/d.
- Actual measured operating duration: 12 hours.
- Measurement method: Metered.
- Reporting date: One day.

**Calculation**

`Gas volume = 0.25 × (12 / 24)`

**Output**

- Derived gas volume: 0.125 MMscf.
- Unit: MMscf.
- Operating duration used: 12 hours.
- Calculation status: Activity-volume calculation completed.

Do not calculate emissions from this result until an applicable approved methodology and required emission-factor inputs are available.

### Example 2: Demonstrating factor-based arithmetic without approving the factor

**Input**

- Activity: Flaring.
- Measured gas volume: 2 MMscf.
- Illustrative factor supplied for demonstration: 55 tCO2e/MMscf.
- Factor status: Illustrative only; not approved for production use.

**Calculation**

`2 MMscf × 55 tCO2e/MMscf = 110 tCO2e`

**Output**

- Demonstration result: 110 tCO2e.
- Calculation status: Illustrative arithmetic only.
- Production approval: Not permitted using this illustrative factor.

The factor is not a universal regulatory factor. A real calculation must use an approved, applicable, sourced, and versioned methodology and factor. Because the example factor is already expressed in tCO2e, do not multiply the result by GWP again.

### Example 3: Blocking a calculation when a required input is missing

**Input**

- Activity: Flaring.
- Selected methodology: Requires gas composition.
- Submitted activity record: Gas volume is present, but gas composition is absent.

**Output**

- Calculation status: Blocked.
- Reason: Required gas-composition input is missing.
- Data integrity: Original activity record remains unchanged.
- Next action: Request the required input or select a documented alternative explicitly permitted by the methodology.

Do not substitute a guessed gas composition or produce a fabricated tCO2e value.

### Example 4: Preserving historical factor versions

**Input**

An approved calculation references factor `EF-001`, version `1.0`. An administrator later approves version `2.0`.

**Output**

The historical calculation continues to reference version `1.0` and remains reproducible. Version `2.0` is available for eligible future calculations. If recalculation is authorised, create a new calculation version and preserve the relationship to the previous result.

### Example 5: Distinguishing venting from flaring

**Input**

A user records a gas release with activity type `venting`.

**Output**

The system routes the record through the applicable venting methodology and factor-selection rules. It does not apply combustion or flaring factors simply because the record concerns a gas release.

## Rules / Edge Cases

### Missing or invalid measurements

- Reject negative gas volumes and negative average rates unless a specifically justified data model and methodology permit them.
- Reject invalid dates, impossible reporting periods, non-finite values, and unrecognised units.
- Do not derive volume when actual operating duration is unknown.
- Do not assume missing readings represent zero activity.
- Do not silently replace missing measurements with estimates.
- Require an explanation and method for estimated values.
- Flag incomplete evidence without treating optional evidence as mandatory at submission.
- Preserve the source record when validation or calculation fails.

### Unit and reference-condition conflicts

- Never compare measurements with incompatible reference conditions without standardisation.
- Never convert between standard and actual volumes using an undocumented assumption.
- Check dimensional consistency before multiplying values.
- Preserve original values and precision after standardisation.
- Make organisation-level reference conditions explicit, while retaining the conditions applicable to each individual measurement.
- Do not treat gauge pressure as absolute pressure.
- If the conversion basis is incomplete, do not manufacture a standardised value.

### Flaring and venting

- Do not apply combustion assumptions to venting.
- Do not apply flaring emission factors to venting unless the factor and methodology explicitly support that activity.
- Treat other gas releases according to their own applicable methodology.
- Keep activity classifications visible in calculation records and reports.

### Emission factors and GWP

- Never invent a factor to make a calculation complete.
- Never use Draft, Under Review, Superseded, or Withdrawn factors for approved calculations.
- Do not silently substitute a newer factor in a historical calculation.
- Do not mix incompatible factor units, methodologies, activity bases, or GWP versions.
- Do not apply GWP twice.
- If a required factor or technical input is unavailable, explain why calculation is blocked.
- Do not treat publication or data entry alone as platform approval.

### Calculation and approval

- Distinguish activity-volume calculations, preliminary emissions calculations, and approved emissions calculations.
- Preserve all calculation inputs, assumptions, sources, and versions.
- Recalculation creates a new version.
- Never overwrite approved results.
- Never allow a submitter to approve their own submission.
- Only approved activity records contribute to official approved emissions reports.
- Clearly identify draft, pending, preliminary, estimated, and approved results.
- Keep validation, calculation, and approval statuses separate.

### Carbon-credit eligibility

- Emissions calculations do not automatically establish carbon-credit eligibility.
- One tonne of tCO2e is not automatically one issued carbon credit.
- Credit eligibility depends on the applicable programme, methodology, baseline, additionality, monitoring, validation, verification, safeguards, and other programme requirements.
- Formal issuance is controlled by the relevant crediting programme or registry.
- Never claim that this platform independently verifies, certifies, or issues credits merely because it calculates emissions or stores evidence.

### Regulatory uncertainty

- If an applicable Nigerian regulatory requirement cannot be verified, identify it as unresolved.
- Do not present assumptions as legal or regulatory requirements.
- Ask for the applicable official document when implementation depends on a specific reporting rule.
- Record the source and version used for every regulatory or methodological decision.
- Do not claim regulatory compliance without evidence that the relevant requirements have been met.
