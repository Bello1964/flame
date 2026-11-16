# Gas-Flaring Methodology and Emission-Factor Reference

**Project:** Carbon Accounting and Carbon Credit Commerce System\
**Scope:** Initial gas-flaring emissions calculator\
**Prepared:** 16 November 2026\
**Methodological basis:** IPCC 2006 Guidelines, API Compendium (2009),
and Nigerian NUPRC guidance and regulations

------------------------------------------------------------------------

## 1. Purpose and scope

This document consolidates the methodological, numerical, operational
and regulatory inputs required to implement the project's initial
gas-flaring calculator.

The three sources have different roles:

  -----------------------------------------------------------------------
  Source                              Role in the platform
  ----------------------------------- -----------------------------------
  IPCC 2006 Guidelines, Volume 2,     Core recognised inventory
  Chapter 4                           methodology, equations, tiers,
                                      reference conditions and
                                      gas-specific accounting

  API Compendium (2009), Section 4.6  Practical oil-and-gas flare
                                      calculation guidance, method
                                      selection, composition-based
                                      calculations and fallback
                                      assumptions

  NUPRC Guide 0024-2022 and           Nigerian operational measurement,
  applicable Nigerian                 recordkeeping, reporting and
  regulations/directives              regulatory requirements
  -----------------------------------------------------------------------

**Methodological hierarchy:** IPCC establishes the inventory
methodology; API supports practical oil-and-gas implementation; NUPRC
establishes the Nigerian regulatory and reporting context. The sources
are complementary and should not be treated as interchangeable factor
libraries.

The system must not use undocumented or untraceable factors. It must
preserve original measurements, standardised values, calculation inputs,
selected methodology, factor versions, assumptions, evidence and
approval history.

The previously discussed **55 tCO₂e/MMscf** figure is excluded. It must
not be used as a universal factor, default, or approved factor unless a
valid authoritative methodology explicitly establishes a narrowly
applicable use for it. The three references consolidated here do not
establish it as a universal flare factor.

------------------------------------------------------------------------

## 2. IPCC 2006 Guidelines --- core accounting methodology

**Primary reference:** *2006 IPCC Guidelines for National Greenhouse Gas
Inventories*, Volume 2: Energy, Chapter 4: Fugitive Emissions. Use the
corrected chapter version identified on the IPCC publication page.

-   IPCC publication page:
    <https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol2.html>
-   Chapter 4 PDF:
    <https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf>

### 2.1 Reference conditions and gas-volume basis

The project has selected the IPCC reference condition:

-   **Temperature:** 15°C.
-   **Absolute pressure:** 101.325 kPa.
-   **Molar-volume conversion used in the relevant IPCC equation:** 42.3
    × 10⁻³ kmol/m³.

These values are tied to the IPCC equation's stated reference
conditions. They are not emission factors.

**Implementation decisions:**

1.  Use 15°C and 101.325 kPa absolute as the standardised gas-volume
    basis for the selected IPCC calculations.
2.  Preserve the original meter reading, original unit, original
    temperature and pressure basis.
3.  Store the converted standard volume separately from the original
    submitted value.
4.  Record the conversion method and any relevant compressibility
    treatment where required by the measurement standard.
5.  Do not silently treat 60°F/14.73 psia and 15°C/101.325 kPa as
    interchangeable.

**Reference:** IPCC 2006 Guidelines, Volume 2, Chapter 4, equation
definitions and reference conditions (Chapter 4 PDF linked above).

### 2.2 Variables relevant to flaring

The IPCC flaring methodology identifies variables including:

  -----------------------------------------------------------------------
  Variable                            Meaning / use
  ----------------------------------- -----------------------------------
  `Q_gas`                             Quantity of gas flared, on the
                                      stated reference basis

  `y_i`                               Molar or volume fraction of each
                                      relevant gas component

  `M_i`                               Molecular weight of the gas
                                      component

  `CE`                                Gas conservation efficiency factor
                                      in the relevant equation

  `X_flared`                          Fraction of waste gas flared rather
                                      than vented

  `FE`                                Flare destruction efficiency

  `X_soot`                            Fraction of non-CO₂ carbon
                                      converted to soot/particulate
                                      matter

  `EF_N2O`                            N₂O emission factor where required
                                      by the selected method
  -----------------------------------------------------------------------

The IPCC equation definitions give molecular weights of:

-   **CH₄:** 16.043.
-   **CO₂:** 44.011.

These are molecular-weight inputs, not emission factors.

**Reference:** IPCC 2006 Guidelines, Volume 2, Chapter 4, equation
definitions.

### 2.3 IPCC efficiency assumptions

The IPCC describes the following typical destruction-efficiency
assumptions in the relevant flaring methodology:

-   **0.98 (98%)** for flares at production and processing facilities.
-   **0.995 (99.5%)** for refinery flares.

The IPCC also describes `X_soot = 0` as a conservative approximation in
the context of the relevant equation where applicable data are absent.

**Implementation decision:** Do not apply 98% or 99.5% automatically to
every flare. Store the efficiency value, source, facility/flare context,
evidence and whether it is measured, vendor-specified,
regulator-required as a design value, or methodology-assumed. The
refinery value must not be applied to an upstream production flare
merely because it is available.

**Reference:** IPCC 2006 Guidelines, Volume 2, Chapter 4, alternative
Tier 2 flaring equations and accompanying text.

### 2.4 IPCC direct factors for known flared volumes

IPCC Table 4.2.5 provides direct factors for known flared gas volumes:

  Gas       Factor Unit
  ----- ---------- --------------------------
  CH₄        0.012 Gg per 10⁶ m³ gas flared
  CO₂          2.0 Gg per 10⁶ m³ gas flared
  N₂O     0.000023 Gg per 10⁶ m³ gas flared

The stated reference case is based on:

-   **98%** flaring efficiency;
-   **91.9%** CH₄;
-   **0.58%** CO₂;
-   **0.68%** N₂; and
-   **6.84%** non-methane hydrocarbons.

The composition percentages are volume/mole fractions in the stated
reference case.

IPCC indicates that where actual flared volumes are known, those volumes
should be used rather than relying on production-based factors.

**Applicability warning:** These are reference-case factors, not
universal factors for every flare stream or site. Their assumptions must
be checked before use. Where actual gas composition and other required
data are available, consider the more detailed applicable method.

**Reference:** IPCC 2006 Guidelines, Volume 2, Chapter 4, Table 4.2.5
and accompanying notes.

### 2.5 IPCC equation structure and method selection

The alternative Tier 2 CO₂ equation for flaring uses variables including
gas-to-oil ratio, oil production, conservation efficiency, fraction
flared, gas molecular weight, gas composition and soot fraction. The
associated N₂O equation uses the relevant activity data and N₂O factor.

The calculator must not implement only one production-based equation and
represent it as applicable to every flare. Method selection must depend
on the activity data available and the selected inventory tier.

**Implementation decision:** Support method selection based on whether
the operator has measured flare volume, gas composition,
production-based inputs, flare-efficiency evidence or an approved
estimation basis.

**Reference:** IPCC 2006 Guidelines, Volume 2, Chapter 4, Equations
4.2.5 and 4.2.8 and associated definitions.

------------------------------------------------------------------------

## 3. API Compendium --- practical flare calculation methods

**Primary reference:** *Compendium of Greenhouse Gas Emissions
Estimation Methodologies for the Oil and Natural Gas Industry*, American
Petroleum Institute, August 2009, Section 4.6.

-   API Compendium PDF (hosted by California Air Resources Board):
    <https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf>

### 3.1 Method-selection sequence

API Figure 4-2 provides a decision sequence for estimating flare
emissions:

1.  If flare-specific test data or vendor specifications are available,
    use them to estimate CO₂ and CH₄.
2.  If not, consider relevant emissions reported to the regulator and
    the applicable API reporting method.
3.  Determine whether flare rate or volume is known.
4.  Use measured gas composition where available.
5.  If composition is unavailable, use an API generic composition only
    as a documented fallback, subject to its limitations.

**Implementation decision:** The calculator must include a
method-selection workflow. Each calculation must store the selected
method, supporting data, source and reason for selection.

**Reference:** API Compendium (2009), Section 4.6, Figure 4-2.

### 3.2 Combustion efficiency and unburned methane

API describes the following hierarchy and assumptions:

-   Prefer flare-specific test results or vendor data over generic
    assumptions.
-   Where appropriate data are unavailable, API's alternative approach
    uses **98% combustion efficiency** for the CO₂ calculation.
-   For residual uncombusted methane, API describes **2%** for
    exploration and production flares.
-   API describes **0.5%** for well-designed and operated refinery
    flares.

These are context-specific assumptions, not interchangeable defaults.
API also explains that flare performance can vary with flame stability,
gas exit velocity, stack diameter, gas heat content and wind conditions.
It notes that some production-flare tests have recorded efficiencies
below 98%.

**Implementation decision:** Store the efficiency as a source-specific
input and distinguish:

-   measured efficiency;
-   vendor-specified efficiency;
-   regulator-required design efficiency; and
-   methodology-based default assumption.

Never label an assumed value as measured performance.

**Reference:** API Compendium (2009), Section 4.6, Figure 4-2 and flare
calculation discussion.

### 3.3 CO₂ calculation from gas composition

API Equation 4-15 calculates CO₂ using:

-   total gas volume flared;
-   molar-volume conversion;
-   molecular weight of CO₂;
-   carbon atoms in each hydrocarbon component;
-   combustion efficiency; and
-   CO₂ already present in the incoming flare gas.

An important distinction is that CO₂ already present in the incoming gas
is counted as direct CO₂. API states that combustion efficiency does not
apply to that incoming CO₂; efficiency applies to conversion of
hydrocarbon carbon into CO₂.

Examples of carbon atoms per molecule:

  Component          Carbon atoms per molecule
  ---------------- ---------------------------
  Methane (CH₄)                              1
  Ethane (C₂H₆)                              2
  Propane (C₃H₈)                             3
  Butane (C₄H₁₀)                             4

**Reference:** API Compendium (2009), Section 4.6, Equation 4-15 and
accompanying explanation.

### 3.4 CH₄ calculation

API Equation 4-16 calculates residual methane using:

-   volume of gas flared;
-   methane mole fraction;
-   fraction of methane left uncombusted;
-   molar-to-mass conversion; and
-   molecular weight of methane.

Conceptually:

``` text
Residual CH4 mass
  = Flared gas volume
  × CH4 mole fraction
  × Uncombusted CH4 fraction
  × Consistent molar-to-mass conversion
  × CH4 molecular weight
```

API gives **379.3 scf per lb-mole** or **23.685 m³ per kg-mole** as
conversion examples. These are tied to API's stated units and reference
basis. Because this project uses the IPCC reference basis, the
implementation must use a consistent IPCC-compatible conversion rather
than silently copying an API conversion constant.

**Reference:** API Compendium (2009), Section 4.6, Equation 4-16 and
accompanying text.

### 3.5 Generic gas composition --- fallback only

API Table 4-10 provides generic upstream compositions:

  Component                                             Raw/produced gas   Gas-processing plant gas
  -------------------------- ------------------------------------------- --------------------------
  CH₄                                                                80%                      91.9%
  Non-methane hydrocarbons                     15% ethane and 5% propane                      6.84%
  N₂                           Not specified in the cited raw-gas column                      0.68%
  CO₂                          Not specified in the cited raw-gas column                      0.58%

These are mole/volume percentages. API explicitly warns that its generic
compositions are not representative of industry averages or typical
values and should only be used when measured composition is unavailable.

**Implementation decision:** Record composition per flare source and
reporting period where possible. A generic composition may only be
selected as a clearly labelled fallback, with source and applicability
conditions stored. It must never silently replace missing laboratory or
chromatograph results.

**Reference:** API Compendium (2009), Table 4-10 and accompanying note.

### 3.6 API emission-factor table

API Table 4-12 gives factor ranges for developing countries and
countries with economies in transition:

  -----------------------------------------------------------------------------
  Flare/source        CO₂ factor      CH₄ factor      N₂O factor Activity basis
  category                                                       
  -------------- --------------- --------------- --------------- --------------
  Gas production 1.2--1.6 × 10⁻³ 7.6 × 10⁻⁷--1.0 2.1 × 10⁻⁸--2.9 Gg per 10⁶ m³
                                          × 10⁻⁶          × 10⁻⁸ gas production

  Sweet gas      1.8--2.5 × 10⁻³ 1.2--1.6 × 10⁻⁶ 2.5--3.4 × 10⁻⁸ Gg per 10⁶ m³
  processing                                                     raw gas feed

  Sour gas       3.6--4.9 × 10⁻³ 2.4--3.3 × 10⁻⁶ 5.4--7.4 × 10⁻⁸ Gg per 10⁶ m³
  processing                                                     raw gas feed

  Conventional   4.1--5.6 × 10⁻² 2.5--3.4 × 10⁻⁵ 6.4--8.8 × 10⁻⁷ Gg per 10³ m³
  oil production                                                 conventional
                                                                 oil production

  Heavy oil/cold 2.2--3.0 × 10⁻² 1.4--1.9 × 10⁻⁴ 4.6--6.3 × 10⁻⁷ Gg per 10³ m³
  bitumen                                                        heavy oil
  production                                                     production

  Thermal oil    2.7--3.7 × 10⁻² 1.6--2.2 × 10⁻⁵ 2.4--3.3 × 10⁻⁷ Gg per 10³ m³
  production                                                     thermal
                                                                 bitumen
                                                                 production
  -----------------------------------------------------------------------------

For gas production, sweet gas processing and sour gas processing, API
reports **±75% uncertainty**. The oil-production categories have their
own uncertainty ranges in the original table.

**Critical applicability warning:** These factors are tied to gas
production, raw gas feed or oil production. They are not all direct
factors per unit of gas flared. Do not multiply them by measured flare
volume as if their activity bases were interchangeable.

**Reference:** API Compendium (2009), Table 4-12 and table notes.

### 3.7 API illustrative calculation

API Exhibit 4.9 illustrates a production flare using:

-   **20 million scf** of gas flared in the year;
-   **80 mole% CH₄**;
-   **2%** uncombusted methane; and
-   **98%** combustion efficiency for the CO₂ calculation.

The example calculates **6.1 tonnes CH₄ per year**.

This is an illustrative calculation under the stated assumptions. It is
not an emission factor to apply to Nigerian facilities.

**Reference:** API Compendium (2009), Exhibit 4.9.

------------------------------------------------------------------------

## 4. NUPRC --- Nigerian regulatory and reporting requirements

Relevant Nigerian materials include:

1.  **NUPRC Guide 0024-2022:** *Guidelines for Management of Fugitive
    Methane and Greenhouse Gases Emissions in the Upstream Oil and Gas
    Operations in Nigeria*.
2.  **Gas Flaring, Venting and Methane Emissions (Prevention of Waste
    and Pollution) Regulations, 2023.**
3.  NUPRC's **11 April 2026 directive** on standardised templates and
    transition to measurement-based methane/GHG reporting.

Links:

-   NUPRC Guide 0024-2022:
    <https://www.nuprc.gov.ng/upload/nuprc_laws/METHANE_AND_GREENHOUSE_GASES_EMISSIONS_1781449647912.pdf>
-   2023 Regulations:
    <https://www.nuprc.gov.ng/upload/nuprc_laws/Gas_Flaring_Venting_and_Methane_Reg_2023_cd4e70a88c3295914a6466e9.pdf>
-   NUPRC 2026 directive announcement:
    <https://nuprcdemo.nuprc.gov.ng/media/news/b3f0614395dd79cd01ae509f>
-   World Bank regulatory overview:
    <https://flaringventingregulations.worldbank.org/nigeria>

The 2023 Regulations are the later regulatory instrument; the older 2022
Gas Flaring and Venting Regulations should not be treated as the current
primary regulation where superseded.

### 4.1 Operational data to capture

The 2023 Regulations require daily flare and vent logs. The logs
include:

-   date;
-   time;
-   duration;
-   flare or vent rate;
-   volume; and
-   gas source/type, such as sour inlet gas or acid gas.

The logs are based on metering equipment installed at the relevant
facilities.

The Regulations also require daily natural-gas records covering:

-   gas produced;
-   weighted average gas-to-oil ratio per facility;
-   gas consumed for own use;
-   gas delivered to existing offtake commitments;
-   gas flared;
-   gas wasted through deliberate venting;
-   gas wasted through incomplete combustion;
-   fugitive emissions; and
-   associated gas utilisation factor.

**Implementation decision:** Capture these as distinct data fields or
records. Do not merge gas produced, flared, vented, incompletely
combusted and fugitive losses into one generic gas-loss quantity.

**Reference:** NUPRC Gas Flaring, Venting and Methane Emissions
(Prevention of Waste and Pollution) Regulations, 2023, daily flare/vent
logs and daily natural-gas recordkeeping provisions.

### 4.2 Reporting frequency and retention

The 2023 Regulations require:

-   daily flare and vent logs;
-   monthly submission to the Commission within **21 days** after
    month-end; and
-   safe custody of the logs for at least **3 years**.

The Regulations also require monthly reporting of natural gas produced,
utilised and disposed of within **21 days** after month-end.

**Implementation decision:** Support daily data capture, monthly
reporting-period aggregation, submission tracking, and retention of
original daily records and supporting evidence.

**Reference:** NUPRC 2023 Regulations, monthly reporting and
record-retention provisions.

### 4.3 Metering, calibration and measurement quality

The 2023 Regulations require metering equipment used for flared and
vented gas to be manufactured, operated, calibrated and inspected in
conformity with NUPRC's applicable Metering and Data Collection
Standards. Meter accuracy must conform to those standards.

**Implementation decision:** A flare measurement record should include:

-   meter identifier;
-   meter type;
-   measurement method;
-   calibration status and date;
-   accuracy or applicable meter specification;
-   measurement period;
-   original reading and unit;
-   standardised volume;
-   reference temperature and pressure;
-   whether the value is measured, estimated or calculated; and
-   supporting evidence.

The IPCC reference basis is the calculation standard selected by this
project. NUPRC's applicable metering requirements still govern the
quality and regulatory acceptability of underlying measurements.

**Reference:** NUPRC 2023 Regulations, metering provisions and NUPRC
Metering and Data Collection Standards.

### 4.4 Flare-efficiency requirement

NUPRC Guide 0024-2022, Section 3.3.2, requires flared gas to be
combusted using an auto-igniter or continuous pilot light and specifies
a design destruction removal efficiency (DRE) of at least **98% for
hydrocarbons**. It also requires operation within parameters needed to
achieve the design efficiency.

The Guide also requires:

-   annual testing of the auto-igniter, or annual observation of the
    continuous pilot light;
-   recording whether the flare is lit during LDAR inspections;
-   records of annual flare-efficiency tests; and
-   records of unlit flares with gas venting.

**Implementation decision:** NUPRC's 98% figure is a design DRE
requirement. It does not establish that every flare actually achieved
98% destruction during every reporting period. Store annual test
evidence and actual site-specific efficiency data where available.

An unlit flare with gas passing through it must not be calculated as
though it operated at 98% combustion efficiency. API treats a flare that
is not operating because there is no flame as a vented source.

**References:** NUPRC Guide 0024-2022, Section 3.3.2; API Compendium
(2009), Section 4.6.

### 4.5 Greenhouse gases and reporting

NUPRC Guide 0024-2022, Section 4.1, requires measurement or estimation
and quarterly reporting of:

-   CO₂;
-   CH₄; and
-   N₂O.

It identifies oil and gas production facilities, export terminals, and
gas-processing, gathering and boosting stations as facilities subject to
the reporting requirement.

The Guide recognises IPCC Tier 1, Tier 2 and Tier 3 methods. It also
allows other methodologies, including API, subject to validation and
approval by the Commission. It requires reporting in line with the IPCC
standard and provides for quality-control validation.

**Implementation decision:** Calculate and store CO₂, CH₄ and N₂O
separately. Do not store only a combined CO₂e value.

**Reference:** NUPRC Guide 0024-2022, Section 4.1 and associated
methodology/reporting provisions.

### 4.6 NUPRC transition to higher-tier reporting

The NUPRC directive dated **11 April 2026** states that operators must:

-   report using at least IPCC Tier 2 methodologies from **Q3 2026**;
    and
-   transition fully to IPCC Tier 3, or equivalent high-level
    measurement-based methods under other recognised frameworks, by
    **January 2027**.

The directive also requires standardised NUPRC templates for the
Greenhouse Gas Emissions Management Plan and methane/GHG emissions
accounting and inventory reporting.

As at **16 November 2026**, the stated Q3 2026 Tier 2 minimum is already
in effect, and the January 2027 Tier 3 transition is approaching.

**Implementation decision:** Support Tier 2 now and design the system
for facility-specific measurement-based data and evidence suitable for
Tier 3 or an equivalent recognised approach.

**Reference:** NUPRC directive announcement, 11 April 2026, linked
above.

------------------------------------------------------------------------

## 5. How the sources fit together

  -----------------------------------------------------------------------
  Source                  What it establishes     Platform implementation
  ----------------------- ----------------------- -----------------------
  IPCC 2006 Guidelines,   Inventory tiers,        Versioned methodology
  Volume 2, Chapter 4     equations, reference    and calculation engine
                          conditions,             
                          gas-specific methods    
                          and factor guidance     

  API Compendium (2009),  Practical flare method  Flare-specific
  Section 4.6             selection,              calculation routes and
                          composition-based CO₂,  documented fallbacks
                          residual CH₄            
                          assumptions and         
                          illustrative factors    

  NUPRC Guide 0024-2022   Nigerian operational    Measurement records,
  and 2023 Regulations    measurement,            validation, reporting
                          flare-efficiency,       and evidence controls
                          recordkeeping and       
                          reporting requirements  

  NUPRC 2026 directive    Tier 2 minimum from Q3  Immediate Tier 2
                          2026 and Tier           support and Tier
                          3/equivalent            3-ready architecture
                          measurement-based       
                          transition by January   
                          2027                    
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 6. Proposed end-to-end calculation workflow

### Step 1 --- Capture operational data

Capture daily flare volume/rate, duration, gas source, meter details,
gas production, gas-to-oil ratio, gas utilisation and supporting
evidence.

### Step 2 --- Validate and standardise

Preserve original readings and convert gas volume to the IPCC reference
basis of **15°C and 101.325 kPa absolute**. Check meter status,
reporting period, units and data quality.

### Step 3 --- Identify flare and operating condition

Identify the flare category, such as production, sweet-gas processing,
sour-gas processing or refinery. Record whether the flare was lit, unlit
or operating abnormally.

### Step 4 --- Select methodology

Select the applicable IPCC tier and calculation route based on activity
data, gas composition, efficiency measurements and regulatory
requirements.

### Step 5 --- Calculate individual gases

Calculate CO₂, CH₄ and N₂O separately using applicable equations and
approved factor versions.

### Step 6 --- Convert to CO₂e

Apply an explicitly selected and versioned GWP source and time horizon.
Preserve individual gas quantities.

### Step 7 --- Review, approve and report

Retain calculation trace, factor references, methodology version,
assumptions, evidence and approval status. Generate reports from
approved calculations.

------------------------------------------------------------------------

## 7. Numerical decisions and configuration register

  -------------------------------------------------------------------------------
  Number/value      Meaning                  Project treatment  Source
  ----------------- ------------------------ ------------------ -----------------
  **15°C**          IPCC reference           Use as standard    IPCC 2006, Vol.
                    temperature              calculation basis  2, Ch. 4

  **101.325 kPa     IPCC reference pressure  Use as standard    IPCC 2006, Vol.
  absolute**                                 calculation basis  2, Ch. 4

  **42.3 × 10⁻³     IPCC molar-volume        Use in the         IPCC 2006, Vol.
  kmol/m³**         conversion at reference  relevant IPCC      2, Ch. 4
                    conditions               equations with     
                                             consistent units   

  **16.043**        Molecular weight of CH₄  Use as             IPCC 2006, Vol.
                                             molecular-weight   2, Ch. 4
                                             input in           
                                             applicable         
                                             equation           

  **44.011**        Molecular weight of CO₂  Use as             IPCC 2006, Vol.
                                             molecular-weight   2, Ch. 4
                                             input in           
                                             applicable         
                                             equation           

  **98%**           IPCC/API                 Record context and IPCC Ch. 4; API
                    flare-efficiency         source; do not     §4.6; NUPRC Guide
                    assumption in specified  label as measured  0024-2022 §3.3.2
                    contexts; NUPRC minimum  performance        
                    design DRE for                              
                    hydrocarbons                                

  **99.5%**         IPCC typical             Apply only where   IPCC 2006, Vol.
                    refinery-flare           refinery context   2, Ch. 4
                    efficiency assumption in and selected       
                    relevant equation        method justify it  
                    context                                     

  **2%**            API residual uncombusted Documented         API Compendium
                    CH₄ assumption for E&P   fallback only      (2009), §4.6
                    production flares        where appropriate  

  **0.5%**          API residual uncombusted Do not apply to    API Compendium
                    CH₄ assumption for       upstream           (2009), §4.6
                    well-designed/operated   production flares  
                    refinery flares                             

  **0.012 Gg/10⁶    IPCC direct CH₄ factor   Use only if        IPCC 2006, Vol.
  m³**              for stated reference     reference          2, Ch. 4, Table
                    flare case               assumptions apply  4.2.5
                                             and method is      
                                             approved           

  **2.0 Gg/10⁶ m³** IPCC direct CO₂ factor   Use only if        IPCC 2006, Vol.
                    for stated reference     reference          2, Ch. 4, Table
                    flare case               assumptions apply  4.2.5
                                             and method is      
                                             approved           

  **0.000023 Gg/10⁶ IPCC direct N₂O factor   Do not approve     IPCC 2006, Vol.
  m³**              as reported in the table until discrepancy  2, Ch. 4, Table
                    transcription used here  noted below is     4.2.5; compare
                                             resolved against   API Table 4-11
                                             the original       footnote
                                             corrected IPCC     
                                             table              

  **91.9% CH₄**     IPCC reference-case gas  Reference-case     IPCC 2006, Vol.
                    composition              assumption only    2, Ch. 4, Table
                                                                4.2.5

  **0.58% CO₂**     IPCC reference-case gas  Reference-case     IPCC 2006, Vol.
                    composition              assumption only    2, Ch. 4, Table
                                                                4.2.5

  **0.68% N₂**      IPCC reference-case gas  Reference-case     IPCC 2006, Vol.
                    composition              assumption only    2, Ch. 4, Table
                                                                4.2.5

  **6.84%           IPCC reference-case gas  Reference-case     IPCC 2006, Vol.
  non-methane       composition              assumption only    2, Ch. 4, Table
  hydrocarbons**                                                4.2.5

  **21 days**       NUPRC monthly submission Implement          NUPRC 2023
                    deadline after month-end submission         Regulations
                                             tracking and       
                                             due-date controls  

  **3 years**       Minimum safe custody     Implement          NUPRC 2023
                    period for flare/vent    record-retention   Regulations
                    logs                     controls           

  **Quarterly**     GHG reporting frequency  Support quarterly  NUPRC Guide
                    in NUPRC Guide 0024-2022 inventory reports  0024-2022

  **Q3 2026**       Start of NUPRC minimum   Support Tier 2     NUPRC directive,
                    Tier 2 reporting                            11 April 2026
                    requirement                                 

  **January 2027**  Tier 3 or equivalent     Design for         NUPRC directive,
                    measurement-based MRV    facility-level     11 April 2026
                    transition               measured data      
  -------------------------------------------------------------------------------

### 7.1 N₂O factor discrepancy --- unresolved

There is a discrepancy that must be resolved before registering the
direct-volume N₂O factor as approved:

-   The IPCC table transcription used in the prior extraction gives
    **0.000023 Gg per 10⁶ m³**.
-   API Table 4-11's footnote, which cites IPCC, also gives **0.000023
    Gg per 10⁶ m³**.
-   A searchable text extraction of the IPCC PDF displayed **0.00023**
    in one corresponding footnote.

**Decision:** Do not load either value as an approved factor until the
original corrected IPCC table is visually checked and the discrepancy is
resolved. Record the final approved value with the exact source edition,
table and page.

------------------------------------------------------------------------

## 8. Outstanding decisions before validated calculator release

  -----------------------------------------------------------------------
  Item                    Current position        Required action
  ----------------------- ----------------------- -----------------------
  Gas reference           IPCC basis selected:    Implement conversion
  conditions              15°C and 101.325 kPa    and test against known
                          absolute                measurements

  Flare efficiency        IPCC/API assumptions    Define capture and
                          and NUPRC design DRE    approval of
                          identified              flare-specific
                                                  efficiency evidence

  Gas composition         API fallback and IPCC   Define measured
                          reference composition   composition import,
                          identified              validation and source
                                                  linkage

  CO₂ calculation         IPCC and API equations  Implement selected
                          identified              methods and independent
                                                  tests

  CH₄ calculation         IPCC and API methods    Implement and test
                          identified              residual methane
                                                  calculations

  N₂O calculation         IPCC equation and API   Resolve factor
                          factor tables           discrepancy and approve
                          identified              applicable method

  GWP values              GWP required for CO₂e   Select authoritative
                          conversion              GWP assessment/version
                                                  and time horizon; do
                                                  not guess numerical
                                                  values

  Nigerian reporting      NUPRC reporting and     Map reports to current
                          measurement obligations NUPRC templates
                          identified              

  Tier 3 measurement      NUPRC transition by     Define facility-level
                          January 2027 identified measurement inputs,
                                                  evidence and
                                                  integrations
  -----------------------------------------------------------------------

### 8.1 GWP governance

The calculator must not guess numerical GWP values. Before CO₂e results
are marked validated, select and document:

-   GWP source/assessment report;
-   publication/version;
-   time horizon (for example, 100-year if required by the applicable
    reporting framework);
-   gas-specific GWP values;
-   effective date; and
-   approval status.

The cited NUPRC Guide recognises that GWP depends on a specified time
horizon but does not, by itself, establish a complete current numerical
GWP set for this calculator.

------------------------------------------------------------------------

## 9. Implementation requirements for the Carbon Project

The initial methodological configuration should be:

1.  **Reference conditions:** IPCC basis, 15°C and 101.325 kPa absolute.
2.  **Core methodology:** IPCC 2006 Guidelines, Volume 2, Chapter 4,
    using the corrected chapter version identified by IPCC.
3.  **Supporting calculation guidance:** API Compendium (2009), Section
    4.6.
4.  **Nigerian regulatory configuration:** NUPRC Guide 0024-2022 and the
    2023 Gas Flaring, Venting and Methane Emissions Regulations.
5.  **Tier requirement:** Support Tier 2 immediately and prepare for
    Tier 3 or equivalent measurement-based MRV by January 2027.
6.  **Gas outputs:** CO₂, CH₄ and N₂O separately, then CO₂e once the GWP
    source and horizon are approved.
7.  **Factor governance:** No undocumented factors, silent defaults,
    overwriting historical calculations or untraceable assumptions.

### 9.1 Required factor-registry fields

Every registered factor should include:

-   unique factor identifier;
-   factor name;
-   numerical value;
-   measurement unit;
-   applicable gas or pollutant;
-   applicable activity type;
-   source organisation;
-   source publication/document;
-   methodology;
-   factor version;
-   publication date;
-   effective date;
-   retrieval date;
-   applicability conditions;
-   approval status; and
-   source page/table/equation reference.

Only approved and applicable factor versions may be used for approved
calculations. A factor update must not silently modify historical
calculations.

### 9.2 Required calculation record

Every calculation should preserve:

-   activity data and original measurement;
-   standardised gas volume;
-   activity type and flare source;
-   measurement method and data-quality classification;
-   gas composition, where required;
-   combustion/destruction efficiency and its evidence;
-   selected methodology and version;
-   exact factor identifiers and versions;
-   GWP source, version and horizon;
-   formula and calculation steps;
-   individual gas results;
-   total CO₂e result;
-   assumptions and missing-data treatment;
-   supporting evidence;
-   reviewer/approver and timestamps; and
-   calculation status.

### 9.3 Calculation statuses

At minimum, distinguish:

-   **Draft:** incomplete or not yet reviewed.
-   **Calculation-ready:** required inputs and evidence pass validation.
-   **Calculated:** calculation completed but not necessarily approved.
-   **Under review:** awaiting technical or compliance review.
-   **Approved:** reviewed and approved under the configured
    methodology.
-   **Incomplete / estimated:** missing data or fallback assumptions
    prevent the result from being represented as fully
    measured/validated.

The application must clearly distinguish incomplete or estimated
calculations from validated emissions accounting.

------------------------------------------------------------------------

## 10. Source register

1.  **IPCC (2006).** *2006 IPCC Guidelines for National Greenhouse Gas
    Inventories*, Volume 2: Energy, Chapter 4: Fugitive Emissions.
    Corrected chapter and publication page:
    <https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol2.html>.
2.  **American Petroleum Institute (2009).** *Compendium of Greenhouse
    Gas Emissions Estimation Methodologies for the Oil and Natural Gas
    Industry*, Section 4.6. PDF:
    <https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf>.
3.  **NUPRC (2022).** *Guide 0024-2022: Guidelines for Management of
    Fugitive Methane and Greenhouse Gases Emissions in the Upstream Oil
    and Gas Operations in Nigeria*. PDF:
    <https://www.nuprc.gov.ng/upload/nuprc_laws/METHANE_AND_GREENHOUSE_GASES_EMISSIONS_1781449647912.pdf>.
4.  **NUPRC (2023).** *Gas Flaring, Venting and Methane Emissions
    (Prevention of Waste and Pollution) Regulations, 2023*. PDF:
    <https://www.nuprc.gov.ng/upload/nuprc_laws/Gas_Flaring_Venting_and_Methane_Reg_2023_cd4e70a88c3295914a6466e9.pdf>.
5.  **NUPRC (11 April 2026).** Directive announcement on standardised
    templates and transition to measurement-based methane/GHG reporting:
    <https://nuprcdemo.nuprc.gov.ng/media/news/b3f0614395dd79cd01ae509f>.
6.  **World Bank.** Nigeria flaring and venting regulatory overview:
    <https://flaringventingregulations.worldbank.org/nigeria>.

------------------------------------------------------------------------

## 11. Important implementation caveat

This document is a consolidated implementation reference, not a
substitute for formal regulatory interpretation, independent
methodological review or verification of the cited source editions.
Before enabling approved production calculations:

-   verify the exact equations and table values against the original
    source PDFs;
-   resolve the N₂O factor discrepancy;
-   approve the GWP source and time horizon;
-   confirm the applicable NUPRC templates and current metering
    standards;
-   have the selected methods and assumptions reviewed by a competent
    GHG inventory specialist.

**The 55 tCO₂e/MMscf figure remains excluded from the calculator's
approved factor registry.**
