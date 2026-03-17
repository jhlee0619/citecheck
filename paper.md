# Automated longitudinal volumetric assessment for progression detection and survival stratification in brain metastases: A retrospective study with multicenter technical validation

**Running Title:** Longitudinal volumetry for brain metastases

**Authors:** [PLACEHOLDER]
**Affiliations:** [PLACEHOLDER]
**Corresponding Author:** [PLACEHOLDER]
**Word Count:** ~5,000 (Introduction--Discussion)
**Figures:** 5 main
**Tables:** 2 main + 10 supplementary

---

## Key Points

- Automated longitudinal segmentation improved lesion-level positive predictive value by 13.5 percentage points (95% confidence interval [CI] 12.1--14.8) over single-timepoint inference while maintaining detection sensitivity, supporting volumetric monitoring across 6,628 magnetic resonance imaging (MRI) examinations.
- Volumetric assessment reclassified 15.7% of 1D-stable scans to progression, with 57.4% confirmed on subsequent automated follow-up assessment and a median 7.1-month detection advantage; in the longitudinal subset (*n* = 953), adding volumetric dynamics provided incremental prognostic discrimination beyond clinical and static volumetric features (within-cohort ΔC-index 0.037, 12-month net reclassification improvement [NRI] 0.080).
- Exploratory risk-stratified surveillance analyses suggested that volumetric features could reduce MRI utilization by 35%, though prospective calibration and impact validation are required before clinical implementation.

---

## Importance of the Study

For brain metastases, response assessment guides both treatment escalation and imaging frequency, yet 1D measurements are insensitive to asymmetric growth and multifocal low-volume disease. In this retrospective study of 3,852 patients, with multicenter technical validation and single-center clinical analyses, we evaluated automated longitudinal volumetric assessment in relation to clinically relevant imaging and prognostic endpoints, including progression discordance, survival stratification, and an exploratory framework for risk-stratified surveillance intervals. The study addresses the translational gap between AI-based segmentation and clinical decision-making.

---

## Abstract

**Background:** One-dimensional Response Assessment in Neuro-Oncology Brain Metastases (RANO-BM) measurements may miss meaningful progression in patients with multiple small brain metastases. We evaluated whether automated longitudinal volumetric assessment could support progression detection, survival stratification, and surveillance planning.

**Methods:** Retrospective study of 3,852 patients (6,628 magnetic resonance imaging [MRI] examinations) with multicenter segmentation validation; 975 patients had longitudinal follow-up (2,707 scan pairs). A temporal deep-learning pipeline generated lesion segmentations and longitudinal volumes. We compared 1D RANO-BM and volumetric response categories, assessed discordance outcomes, and tested incremental survival discrimination (clinical model, +volume, +dynamics) in 3,749 patients. Decision-curve and simulation analyses evaluated risk-stratified MRI intervals.

**Results:** Size-stratified detection sensitivity ranged from 33.6% (<3 mm) to 96.9% (≥12 mm); mean Dice was 83.4% internally and 51.5--70.3% externally. Temporal inference improved positive predictive value by 13.5 percentage points (95% confidence interval [CI] 12.1--14.8) at the internal center while maintaining detection sensitivity. Response classification concordance was 87.5%. Volumetry reclassified 15.7% of 1D-stable cases to progression; 57.4% were confirmed on subsequent automated follow-up assessment, with a median 7.1-month detection advantage. Overall survival discrimination improved from C-index 0.590 (clinical, *n* = 3,749) to 0.615 (+volume); in the longitudinal subset (*n* = 953), adding dynamics further improved discrimination to 0.679 (within-cohort ΔC-index 0.037; 12-month net reclassification improvement [NRI] 0.080). Exploratory risk-stratified surveillance analyses reduced projected MRI utilization by 35% with +40 days detection delay and 1.0% missed progression.

**Conclusions:** Automated longitudinal volumetric assessment identified additional progression not captured by 1D criteria and provided incremental prognostic information beyond clinical and static volumetric features in this retrospective cohort. Exploratory surveillance analyses suggest a path toward interval personalization, but prospective calibration and impact studies are required before clinical use.

---

## Introduction

Brain metastases affect 20--40% of patients with systemic cancer and represent a leading cause of neurological morbidity and mortality [1,2,3]. With improving systemic disease control and prolonged survival [4,5], patients increasingly undergo repeated courses of intracranial treatment and extended periods of post-treatment monitoring. Serial contrast-enhanced MRI is the cornerstone of intracranial disease monitoring, guiding decisions regarding treatment escalation after stereotactic radiosurgery, systemic therapy modification, and the timing of salvage interventions. The Response Assessment in Neuro-Oncology Brain Metastases (RANO-BM) criteria established a standardized framework for evaluating treatment response using the sum of longest diameters of up to five target lesions [6], complementing the broadly adopted Response Evaluation Criteria in Solid Tumours (RECIST 1.1) criteria for extracranial disease [7]. These unidimensional criteria have been endorsed by international guidelines from the European Association of Neuro-Oncology--European Society for Medical Oncology (EANO-ESMO) [8] and the American Society of Clinical Oncology--Society for Neuro-Oncology--American Society for Radiation Oncology (ASCO-SNO-ASTRO) [9] and remain the predominant method for response assessment in clinical trials and routine practice. Current guidelines generally recommend MRI surveillance every 2--3 months regardless of individual risk, an approach that places substantial burden on healthcare systems and patients alike.

Despite their widespread adoption, unidimensional measurements have well-documented limitations that become particularly problematic in multifocal disease. Linear diameter captures only one axis of what is inherently a three-dimensional process, rendering it insensitive to asymmetric growth, diffuse volumetric change, and the appearance of small new lesions below the measurability threshold. The restriction to five target lesions further reduces sensitivity in patients with numerous metastases, in whom non-target disease may evolve independently. Prior studies have shown substantial inter-reader variability in volumetric measurement [10], discordance between diameter- and volume-based response criteria after stereotactic radiosurgery [11], and nonlinear volumetric regression patterns that diameter-based assessment does not capture [12]. More recent multicenter studies reported that volumetric criteria detect substantially more progression than RANO-BM and may do so earlier [13,14]. Collectively, these findings suggest that unidimensional assessment systematically underestimates disease progression, particularly in patients with numerous small metastases.

Advances in deep learning have made automated brain metastasis segmentation increasingly feasible. Multi-institutional benchmarks and contemporary architectures have established strong technical foundations for automated lesion detection and segmentation [15--17], and recent studies have shown that longitudinal models can further improve reliability and workflow efficiency [18--20]. Automated volumetric response assessment has also shown clinical promise in other neuro-oncology settings, including glioma [21]. However, a critical translational gap persists: segmentation performance alone does not answer the clinical questions that drive management. In brain metastases, evidence linking automated longitudinal volumetric monitoring to clinically relevant endpoints such as response discordance, earlier progression detection, survival stratification, and surveillance planning remains limited.

We therefore conducted this retrospective longitudinal study, with multicenter segmentation validation and single-center clinical analyses, to address three related questions: (1) Does three-dimensional volumetric assessment identify intracranial progression differently or earlier than conventional one-dimensional RANO-BM criteria? (2) Does longitudinal volumetric assessment improve survival stratification beyond clinical and static volumetric features? and (3) Can baseline volumetric risk phenotypes inform more personalized MRI surveillance intervals?

---

## Methods

### Study Design and Cohorts

This retrospective study was approved by the institutional review boards at participating institutions with waiver of informed consent. Ground-truth segmentation labels at SNUH were annotated by trained research fellows (radiology residents with 2--4 years of experience) under the supervision of a board-certified neuroradiologist, using semi-automated contouring followed by slice-by-slice manual correction on post-contrast T1-weighted images. External datasets (Stanford, StanfordSE, UCSF) used annotations from their respective institutional protocols, as previously described [18,15]. The development cohort comprised patients with brain metastases from Seoul National University Hospital (SNUH), including 3,852 patients who underwent 6,628 MRI examinations. Of these, 6,162 scans with ground-truth annotations were split into training (4,221 scans), validation (616 scans), and internal test (1,325 scans) sets; the remaining 466 scans without annotations were used only for clinical analyses. Three external test cohorts were included for generalizability assessment: Stanford (105 patients, 105 scans), Stanford Stereotactic Edition (StanfordSE; 105 patients, 105 scans), and University of California San Francisco (UCSF; 223 patients, 324 scans — 223 single-timepoint and 101 temporal scans from a longitudinal subset of 66 patients). In total, 433 patients contributed 534 scans across the three external centers. Among the full cohort, 975 patients had two or more longitudinal timepoints, yielding 2,707 scan pairs for response-assessment analyses. For survival modeling, 3,749 patients with known vital status were included. Inclusion criteria were age 18 years or older, histologically or radiologically confirmed brain metastases, and availability of post-contrast three-dimensional T1-weighted MRI. Patients with incomplete imaging, severe motion artifacts, or missing clinical data were excluded. A patient flow diagram is provided in Supplementary Figure S1. Clinical analyses were conducted using SNUH data, whereas external centers contributed to segmentation validation. The TRIPOD+AI checklist is provided in Supplementary Table S1. Cohort demographics and baseline disease burden are presented in Table 1. Multivariable Cox regression results are provided in Supplementary Tables S4a and S4b.

### Automated Segmentation Pipeline

Lesion segmentation used a two-stage deep learning pipeline. Stage 1 employed a ten-model ensemble (five-fold cross-validation × two architectures: Residual U-Net [ResUNet] and SwinUNETR) trained on single-timepoint post-contrast T1-weighted images. Stage 2 extended both backbones (LongResUNet, LongSwinUNETR) by incorporating prior-timepoint imaging and the preceding segmentation mask through a Longitudinal Prior Fusion Module (LPFM) applied at all encoder skip connections, with the temporal contribution gated by a normalized cross-correlation registration quality score. Inference used sliding window processing (96³ patches) with arithmetic-mean probability averaging across all ten ensemble models. The overall study pipeline — encompassing multicenter data aggregation, longitudinal segmentation with prior fusion, longitudinal tumor matching across serial examinations, and downstream clinical analyses — is illustrated in Figure 1. Full details are provided in the Supplementary Methods.

### Lesion Tracking

Individual lesions were extracted as connected components from segmentation masks. Longitudinal tumor matching was performed using the Hungarian algorithm [22] applied to a centroid distance matrix, with a maximum matching distance of 20 mm. Matched lesions were classified as persistent, new (unmatched at follow-up), or resolved (unmatched at baseline). Lesion volume (mm³) was computed as voxel count multiplied by voxel spacing product; total intracranial burden was the sum of all lesion volumes per timepoint.

### Response Assessment Criteria

Two parallel response classification schemes were applied to each scan pair. Automated unidimensional assessment followed the structure of established RANO-BM criteria [6]: the sum of longest diameters of up to five target lesions was computed from segmentation masks, with response categories defined as complete response (CR; disappearance of all target lesions), partial response (PR; ≥30% decrease in sum of longest diameters), stable disease (SD; neither sufficient decrease for PR nor sufficient increase for PD), and progressive disease (PD; ≥20% increase with ≥5 mm absolute increase, or any new lesion). This automated implementation approximates but does not replicate clinical RANO-BM, which requires radiologist-selected target lesions; the automated approach was applied identically to both measurement methods to enable fair comparison. Three-dimensional volumetric assessment used total intracranial tumor volume with thresholds adapted from prior volumetric studies [11,13]: volumetric CR (vCR; disappearance of all measurable lesions), volumetric PR (vPR; ≥65% volume decrease), volumetric SD (vSD), and volumetric PD (vPD; ≥40% volume increase or any new lesion). The 40% volume increase threshold for vPD was chosen to be more sensitive than the geometric equivalent of the 1D 20% diameter increase (which corresponds to approximately 73% volume increase under spherical assumptions, 1.2³ ≈ 1.73), consistent with prior evidence that volumetric changes capture clinically meaningful disease evolution below the threshold of unidimensional detection [11,13]. The presence of any new lesion was classified as progression regardless of volume changes. Response concordance was defined as agreement between 1D and 3D classifications; discordance was categorized by direction (1D underestimation vs. overestimation of progression). Because multiple scan pairs could derive from the same patient, concordance rates should be interpreted as scan-pair-level rather than patient-level estimates.

### Clinical Endpoints

Clinical endpoints were defined at three levels. First, for response-assessment analyses, the primary endpoint was concordance versus discordance between automated 1D RANO-BM and 3D volumetric classifications, with particular attention to discordant progression calls and subsequent confirmation on the next available MRI. Second, for prognostic analyses, overall survival (OS) was defined as the interval from the date of the index MRI scan to death from any cause; patients without recorded death were censored at their last imaging-linked follow-up date in the clinical dataset. Longitudinal dynamics were additionally summarized using four prespecified dynamic groups based on annualized growth rate: Rapid Growth, Slow Growth, Stable, and Shrinking. Third, for surveillance analyses, baseline volumetric features were used to define four burden phenotypes without reference to outcomes: No measurable burden (volume = 0), Large-volume burden (volume > 1,000 mm³), Limited burden (0 < volume ≤ 1,000 mm³ with ≤3 lesions), and Multifocal burden (0 < volume ≤ 1,000 mm³ with >3 lesions). Surveillance utility was evaluated in terms of net benefit, scan reduction, detection delay, and missed progression.

### Statistical Analysis

Kaplan-Meier curves were compared using log-rank tests. Cox proportional hazards models were constructed in three incremental tiers to assess the added prognostic value of volumetric information [23]: Model 1 (clinical: age, sex, primary cancer type), Model 2 (clinical + static volume: log-transformed total tumor volume and lesion count), and Model 3 (clinical + volume + dynamics: growth rate and dynamic-group classification). Model discrimination was assessed using Harrell's C-index with bootstrap confidence intervals, net reclassification improvement (NRI), and integrated discrimination improvement (IDI). A separate scan-level cluster-robust Cox analysis incorporated age, sex, baseline volume, lesion count, largest lesion diameter, prior treatment, growth rate, new-lesion rate, time-weighted average volume, and primary cancer type to account for within-patient correlation across repeated scans.

To address potential bias in discordance analyses, landmark analysis was anchored at the date of 1D-detected progression, and time-dependent Cox regression modeled progression status as a time-varying covariate. For surveillance analyses, decision curve analysis (DCA) compared risk-stratified and uniform scanning strategies, and a Monte Carlo simulation quantified trade-offs between scan reduction, detection delay, and missed progression under candidate intervals. Calibration was assessed using calibration plots with slope and intercept estimation; additional details on reclassification metrics, repeated-measures handling, bias correction, and surveillance modeling are provided in the Supplementary Methods.

All statistical tests were two-sided at a significance level of α = 0.05. Because incremental model comparisons were prespecified and hierarchical, no correction for multiple comparisons was applied to likelihood ratio tests. Subgroup analyses were exploratory and should be interpreted accordingly. Analyses were performed using Python 3.10 with lifelines, scipy, and scikit-learn. All surveillance-related analyses should be considered hypothesis-generating. A complete TRIPOD+AI [29,30,31] checklist is provided in Supplementary Table S1, and reporting follows CONSORT-AI [32] recommendations where applicable.

---

## Results

The study included 3,852 patients who underwent 6,628 MRI examinations at SNUH, with 433 additional patients contributing 534 scans from three external centers used for segmentation validation. Among these patients, 975 had two or more longitudinal timepoints, yielding 2,707 scan pairs for response assessment. The survival-modeling cohort comprised 3,749 patients with known vital status, and the longitudinal subset included 953 patients with two or more timepoints. Lung cancer was the most common primary malignancy (54.8%), followed by breast cancer (14.1%) and other histologies (23.1%). Visible measurable intracranial tumor burden at baseline was more common in the longitudinal subset than in the overall cohort (70.5% vs. 33.2%; Table 1).

### Technical Validation of Automated Segmentation

We evaluated the automated segmentation pipeline to establish that volumetric measurements were sufficiently accurate for downstream longitudinal assessment. In single-timepoint mode, 7,054 ground-truth lesions across 586 scans from four centers were evaluated. Detection sensitivity was strongly size-dependent: 33.6% (255/759) for lesions smaller than 3 mm, 70.6% (2,635/3,732) for 3--6 mm, 87.8% (1,588/1,809) for 6--12 mm, and 96.9% (731/754) for lesions 12 mm or larger (Supplementary Tables S2a--S2c; Figure 2). Segmentation quality varied by center. The internal test set (SNUH) achieved a mean Dice similarity coefficient (DSC) of 83.4%, Normalized Surface Dice (NSD) of 94.7%, and 95th-percentile Hausdorff distance (HD95) of 1.41 mm. External centers showed the expected performance attenuation, with DSC values of 70.3% (UCSF), 59.2% (Stanford), and 51.5% (StanfordSE); NSD values of 90.0%, 83.4%, and 76.0%; and HD95 values of 1.73, 2.87, and 2.79 mm, respectively. Predicted and reference lesion volumes showed strong agreement (Spearman ρ > 0.95; Figure 2C), and Bland-Altman analysis confirmed minimal systematic bias (Figure 2D). Importantly, the Stage 2 temporal architecture maintained single-timepoint performance without degradation (SNUH DSC 83.4% vs. 83.0% for Stage 1), indicating that the additional temporal input channels did not compromise baseline segmentation quality. A comparison of individual model architectures versus the ensemble is provided in Supplementary Table S5.

The temporal inference mode was evaluated on 4,993 lesions across 553 follow-up scans from SNUH and UCSF. Detection sensitivity for 3--6 mm lesions improved from 70.6% to 79.9%. More importantly, temporal inference markedly improved positive predictive value (PPV). At SNUH, ensemble-averaged lesion-level PPV increased from 54.3% to 67.8% (+13.5 percentage points [pp]; bootstrap 95% CI for the difference, 12.1--14.8 pp); at UCSF, it increased from 76.4% to 79.6% (+3.2 pp; 95% CI 1.3--5.1 pp). This improvement was consistent across lesion sizes (e.g., 3--6 mm PPV at SNUH: 65.8% → 75.7%). Temporal context therefore substantially reduces false-positive detections, a critical requirement for longitudinal monitoring because accumulated false positives across serial scans undermine clinical confidence.

Full size-stratified detection and segmentation metrics across all centers and modes are reported in Supplementary Tables S2a--S2c (detection) and Supplementary Tables S3a--S3c (segmentation). Detection used a permissive any-overlap criterion; stricter matching (DSC > 0.1) reduced sensitivity by less than 3 percentage points for lesions 6 mm or larger. Given the high detection sensitivity in this clinically relevant size range and the substantial PPV improvement with temporal inference, we considered the pipeline adequate for automated volumetric measurements in subsequent clinical analyses.

### Discordance Between One-Dimensional and Volumetric Response Assessment

We next compared response classifications derived from conventional 1D RANO-BM criteria with those from 3D volumetric assessment. Among 2,707 scan pairs evaluated by both approaches, response classification was concordant in 2,369 (87.5%) and discordant in 338 (12.5%). One-dimensional assessment categorized scan pairs as complete response (CR) in 16.5%, partial response (PR) in 12.2%, stable disease (SD) in 33.0%, and progressive disease (PD) in 38.3%. Volumetric assessment yielded modestly shifted distributions: 16.5% vCR, 9.6% vPR, 31.4% vSD, and 42.5% vPD, with a net shift toward more progression and less partial response (Figure 4B).

Discordance was asymmetric: in 146 scan pairs (5.4%), 1D criteria missed volumetric progression, whereas in only 31 (1.1%) did 1D criteria classify progression that volumetric criteria did not confirm. The remaining 161 discordant cases (5.9%) involved other category disagreements (e.g., PR vs. vSD).

Among 893 scan pairs classified as SD by RANO-BM, 140 (15.7%) were reclassified to volumetric progressive disease (vPD). In 101 of these reclassified cases with available follow-up imaging, 58 (57.4%) showed confirmed progression on the next scan.

### Clinical Implications of Earlier Volumetric Progression Detection

Among 36 patients in whom 3D criteria detected progression before 1D confirmation, the guarantee-time-corrected median time advantage was 7.1 months (mean 8.0 months). An additional 10 patients had volumetric progression that 1D criteria never detected during the entire follow-up period (Figure 4D).

Patients reclassified from SD to vPD had a median overall survival (OS) of 34.8 months (*n* = 115), compared with 12.0 months for patients with concordant SD (*n* = 94) and 18.5 months for patients with concordant PD (*n* = 439). All pairwise log-rank comparisons were statistically significant (*p* < 0.001), although these comparisons are vulnerable to lead-time and selection effects.

Bias-focused analyses were directionally consistent but underpowered. Landmark analysis anchored at the date of 1D-detected progression yielded a hazard ratio (HR) for death of 1.27 (95% CI 0.83--1.93; *p* = 0.27) in patients with earlier 3D detection. No patients died in the interval between 3D-detected and 1D-detected progression, and only 3 of 36 patients (8.3%) had treatment changes during the discordant interval; sensitivity analysis excluding these patients was unchanged (*p* = 0.84). Time-dependent Cox regression showed that both 3D-detected progression (HR 2.34, 95% CI 1.98--2.77; *p* < 0.001) and 1D-detected progression (HR 2.38, 95% CI 2.02--2.81; *p* < 0.001) were associated with mortality.

### Incremental Prognostic Value of Volumetric Features

Of 3,852 patients, 3,749 had known vital status and were included in survival modeling; 2,188 deaths (58.4%) were observed over a median OS of 15.0 months. We assessed the incremental prognostic value of volumetric features using a series of nested Cox proportional hazards models (Table 2; Supplementary Tables S4a and S4b; Figure 5C).

A baseline clinical model (Model 1) incorporating age, sex, and primary cancer type yielded a C-index of 0.590 (*n* = 3,749). Adding static volumetric features---log-transformed total tumor volume and lesion count---to form Model 2 improved discrimination to a C-index of 0.615, with a bootstrap-estimated increment of 0.026 (95% CI 0.015--0.037), indicating that even a single cross-sectional volumetric measurement adds prognostic information beyond standard clinical variables.

To assess the incremental value of longitudinal dynamics, we focused on the 953 of 975 multi-timepoint patients with known vital status, in whom the volume model (Model 2b) achieved a C-index of 0.642. Adding growth rate and dynamic-group classification (Model 3) increased the C-index to 0.679, representing an observed increment of 0.037 over the volume model within the same cohort (bootstrap mean ΔC 0.035, 95% CI 0.016--0.055). The C-index values of Models 1--2 (full cohort, *n* = 3,749) and Models 2b--3 (longitudinal subset, *n* = 953) are not directly comparable because of differing sample composition; the appropriate tests of added value are the within-cohort incremental comparisons (Model 1 vs. 2; Model 2b vs. 3).

Reclassification analyses corroborated these findings. At 12 months, the net reclassification improvement (NRI) for the dynamics model over the volume model was 0.080 (event NRI 0.116, non-event NRI -0.036), with an integrated discrimination improvement (IDI) of 0.033. At 24 months, reclassification performance was stronger: NRI 0.224 (event NRI -0.036, non-event NRI 0.260) and IDI 0.053.

Because patients contributed multiple scans, we fit a cluster-robust Cox model (*n* = 3,569 scans from 953 patients) to account for within-patient correlation. Log-transformed volume remained significantly associated with mortality (HR 1.089 per unit increase; *p* < 0.001), as did lesion count (HR 1.004 per lesion; *p* < 0.001) (Supplementary Table S4b). Calibration, however, was imperfect: calibration slopes were 1.39 at 12 months and 1.25 at 24 months, and Hosmer-Lemeshow statistics were 35.5 (*p* < 0.001) and 22.6 (*p* = 0.004), respectively.

### Longitudinal Dynamics and Survival Stratification

Dynamic group analysis among multi-timepoint patients classified volume trajectories into four categories: Rapid Growth (*n* = 218), Slow Growth (*n* = 158), Stable (*n* = 288), and Shrinking (*n* = 289). Kaplan-Meier analysis demonstrated significant survival separation across these trajectory-defined groups (log-rank *p* < 0.001), with Rapid Growth patients experiencing the worst outcomes and Stable patients the most favorable survival, while the Shrinking group showed intermediate outcomes rather than the longest survival (Figure 5A). Time-dependent area under the curve (AUC) analysis confirmed stable discriminative ability: 0.679 at 6 months, 0.658 at 12 months, 0.660 at 18 months, and 0.660 at 24 months, suggesting consistent prognostic information over the evaluated time horizon rather than an early signal that attenuates. Representative longitudinal MRI cases illustrating heterogeneous volume trajectory patterns are shown in Figure 3.

A 6-month landmark analysis further supported the clinical relevance of early longitudinal volumetric change. Patients whose tumor volume had decreased or remained stable at 6 months (volume responders) had significantly better subsequent survival than non-responders (*p* = 0.003), indicating that early volumetric trajectory retains prognostic information beyond baseline burden alone.

Sensitivity analyses demonstrated robustness across clinically relevant subgroups. Volume and lesion count remained significant predictors in lung cancer patients (*n* = 2,054; C-index 0.585), post-treatment patients (*n* = 915; C-index 0.616), and pre-treatment patients (*n* = 2,834; C-index 0.614). The breast cancer subgroup (*n* = 528) had Cox-model convergence issues because of near-uniform sex distribution; a sensitivity analysis excluding sex from the covariate set confirmed that volume remained a statistically significant predictor (*p* < 0.01).

### Risk-Stratified Surveillance

Building on the prognostic value of baseline volumetric features, we explored whether baseline burden phenotypes could inform personalized surveillance intervals. Four groups were defined using baseline total tumor volume and lesion count without reference to outcomes. In interval-level analyses, observed progression rates were 13.7% (66/482) for No measurable burden, 44.5% (486/1,092) for Large-volume burden, 53.2% (428/805) for Limited burden, and 52.1% (171/328) for Multifocal burden.

Survival analysis supported prognostic separation across these surveillance phenotypes. In the subset with both survival data and a first-interval risk assignment (*n* = 953), Kaplan-Meier curves differed significantly across groups (log-rank *p* < 0.001; Figure 5B). Median OS was longest in the No measurable burden group and shortest in the Large-volume burden group, while the Limited and Multifocal burden groups showed intermediate outcomes. These results support the use of simple volumetric phenotypes as pragmatic surveillance strata, but should be interpreted descriptively because the surveillance analyses were derived from the same single-center cohort.

Decision-curve analysis comparing risk-stratified scanning with uniform every-3-month scanning demonstrated equal or greater net benefit for the risk-stratified approach across the examined threshold probabilities (1--50%). In the clinically relevant 10--30% threshold range, the mean net-benefit gain over uniform 3-month scanning was 0.016, with a maximum gain of 0.041 at a 30% threshold probability (Figure 5D). These results suggest that tailoring scan frequency to baseline risk may improve resource allocation without obvious loss of clinical utility.

A simulation study modeling 1,000 patients per group over 24 months quantified the trade-offs of risk-adapted scanning. Risk-stratified intervals achieved a 35% reduction in total scans compared with uniform 3-month scanning (5.2 vs. 8.0 scans per patient), at the cost of a mean additional detection delay of 40 days over uniform 3-month scanning and 1.0% of patients with a missed progression. The candidate intervals were every 9 months for the No measurable burden group, every 6 months for the Large-volume burden group, every 4 months for the Limited burden group, and every 2 months for the Multifocal burden group. A practical zero-miss strategy identified in the simulation achieved a 66.7% scan reduction relative to every-2-month surveillance (4 vs. 12 scans per patient) with a mean detection delay of 99 days in the Large-volume burden group (Figure 5E). These interval proposals should be regarded as hypothesis-generating and require prospective validation before adoption. More broadly, the analysis suggests that volumetric risk features may support individualized surveillance in principle, rather than defining definitive scanning protocols.

Subgroup analyses demonstrated consistency of the risk gradient across primary cancer types, including lung (*n* = 1,855), breast (*n* = 324), and other histologies (*n* = 528), as well as across pre-treatment (*n* = 1,425) and post-treatment (*n* = 1,282) clinical settings. The persistence of the risk gradient across these contexts supports generalizability, though external validation remains essential before clinical implementation.

---

## Discussion

This retrospective study, with multicenter technical validation of segmentation and single-center clinical analyses, supports three principal findings. First, automated longitudinal volumetric assessment showed clinically meaningful discordance with unidimensional RANO-BM criteria, reclassifying 15.7% of cases considered stable to volumetric progression; 57.4% of reclassified cases were confirmed on subsequent automated follow-up assessment, and progression was identified a median of 7.1 months earlier than by conventional assessment. Second, volumetric dynamics improved survival stratification beyond clinical and static volume features, with an observed within-cohort concordance-index increment of 0.037 and stable discriminative ability over time (AUC 0.66--0.68). Third, exploratory volumetric risk-stratification analyses suggested that MRI utilization could be reduced in simulation modeling, although this finding requires prospective validation before clinical implementation.

These findings extend prior evidence of clinically meaningful discordance between linear and volumetric response assessment in brain metastases. Ocaña-Tienda et al. [13] showed that volumetric criteria detected nearly twice as many recurrences as RANO-BM across five centers and did so 3.3 months earlier, whereas Douri et al. [14] reported that RANO-BM had only 38% sensitivity for clinically confirmed progression after stereotactic radiosurgery. Our concordance rate of 87.5% and reclassification rate of 15.7% are consistent with those reports, but the present study extends that literature in two ways. First, the workflow is fully automated rather than based on manual volumetry, making longitudinal assessment feasible at cohort scale. Second, the analysis links volumetric discordance not only to category migration but also to patient-level timing differences, incremental survival modeling, and exploratory surveillance design. In this respect, our study moves beyond technical segmentation performance toward a clinically oriented longitudinal imaging framework. The PPV improvement with temporal inference (+13.5 pp at SNUH; 95% CI 12.1--14.8) also addresses a practical barrier to clinical adoption highlighted by Luo et al. [20], whereas the dynamic-group and C-index findings extend prior observations by Kobets et al. [33] and Oft et al. [12] that longitudinal tumor kinetics carry prognostic information beyond single-timepoint measurements.

The observed SD-to-vPD reclassification is clinically relevant because 1D criteria are particularly vulnerable to underestimating multifocal small-volume growth, a pattern common in treated brain metastases. In this context, volumetric assessment may identify meaningful intracranial change that remains below conventional measurability thresholds when lesions are numerous or asymmetric. The 57.4% confirmation rate on subsequent automated follow-up assessment supports the clinical plausibility of this reclassification and argues against simple measurement noise as the sole explanation. However, earlier volumetric detection should not be conflated with improved patient outcome. The median 7.1-month time advantage was based on a limited sample (*n* = 36) and was not statistically significant after lead-time correction (landmark HR 1.27, *p* = 0.27), so the present data support earlier recognition of progression rather than a survival benefit from earlier recognition itself. This distinction is important for clinical interpretation and for future prospective validation.

The prognostic findings also warrant a pragmatic interpretation. The incremental C-index improvement from adding longitudinal dynamics was modest in absolute magnitude, but it was consistent across complementary metrics and aligned with the broader literature showing that imaging biomarkers tend to provide incremental, rather than transformative, gains when added to clinical prognostic models. Similarly, the baseline burden phenotypes used for surveillance analyses should be viewed as pragmatic imaging strata rather than biologically pure risk classes. Their value lies in capturing clinically actionable heterogeneity in intracranial burden using simple volumetric descriptors available at baseline.

The surveillance results are best understood as hypothesis-generating. Wu et al. [34] showed that MRI surveillance models in metastatic lung cancer can identify groups with markedly different risks of brain involvement, thereby informing follow-up intensity. Our framework extends this logic to patients with established brain metastases by using volumetric features to define baseline imaging strata and simulate interval adaptation. Nevertheless, the surveillance component of this study remains exploratory because it was derived from single-center clinical data, relies on a model with imperfect calibration, and has not been tested prospectively as a decision-support strategy. The present results therefore support feasibility and rationale, rather than immediate implementation.

Several counterintuitive findings warrant careful interpretation. Patients reclassified from stable disease to volumetric progressive disease paradoxically showed longer median overall survival (34.8 months) than both patients with concordant stable disease (12.0 months) and those with concordant progressive disease (18.5 months). This pattern likely reflects a combination of methodological biases rather than a true protective effect of reclassification. Selection bias may contribute, as patients with sufficient follow-up imaging to permit reclassification inherently had longer observation periods. Immortal time bias is also relevant: reclassified patients were, by definition, alive long enough for discordance between unidimensional and volumetric criteria to be identified. Furthermore, volumetric progression detected from small baseline volumes may represent biologically less aggressive disease than clinically overt progression. These survival differences should not be interpreted causally and do not imply that volumetric reclassification identifies a favorable prognostic subgroup.

This study has several limitations. The retrospective design introduces inherent selection bias, and although segmentation was validated across four centers, the clinical analyses (response concordance, survival, surveillance) relied on SNUH data only; in this manuscript, "multicenter" therefore refers primarily to segmentation validation, and external clinical validation remains necessary. Segmentation performance was lower externally (DSC 51.5--59.2% at the Stanford centers) than in the internal test set, which may affect volumetric accuracy, although volume estimation is generally more robust than boundary precision to moderate segmentation errors. The 57.4% confirmation rate for volumetric reclassification relied on the same automated volumetric assessment at the subsequent timepoint and therefore introduced a degree of circular validation, while the automated 1D assessment only approximates clinical RANO-BM, which involves radiologist-selected target lesions. The dynamics model used follow-up-derived features and should therefore be interpreted as longitudinal discrimination within the multi-timepoint subset rather than as a baseline-only prognostic model. Model calibration was poor (Hosmer-Lemeshow *p* < 0.001), limiting direct clinical application of predicted probabilities, and the lead-time bias analysis was underpowered (*n* = 36), precluding firm conclusions about whether earlier detection translates to improved outcomes. Our framework also cannot distinguish true progression from radionecrosis or pseudoprogression without additional imaging sequences or histopathological confirmation [35], and we did not assess workflow integration, reading time, or clinician acceptance. Finally, incomplete treatment-modality data precluded treatment-specific subgroup analyses, and the lower volumetric progression threshold (40% vs. the geometric equivalent of approximately 73%) inherently favors detection of more volumetric progressions, meaning that part of the observed discordance reflects threshold choice rather than solely the added sensitivity of three-dimensional measurement.

Future work should prioritize external clinical validation of volumetric response assessment, prospective testing of surveillance strategies, and workflow studies evaluating implementation feasibility and clinician acceptance [20]. Additional integration of perfusion and diffusion imaging may also help address the unresolved distinction between progression and treatment-related change [35,36].

---

## Conclusions

Automated longitudinal volumetric assessment may identify intracranial progression missed by unidimensional RANO-BM criteria, with reclassification supported by subsequent automated follow-up assessment in more than half of discordant cases, although independent adjudication is needed to confirm clinical significance. In the multi-timepoint subset, volumetric dynamics improved survival discrimination beyond clinical and static burden features. Risk-stratified MRI surveillance based on volumetric features may reduce imaging burden, but model miscalibration and the absence of external clinical validation require prospective studies before implementation.

---

## Data and Code Availability

[PLACEHOLDER: repository / access conditions / model weights / clinical tracker application].

---

## References

1. Suh JH, Kotecha R, Chao ST, et al. Current approaches to the management of brain metastases. *Nat Rev Clin Oncol.* 2020;17(5):279--299.
2. Achrol AS, Rennert RC, Anders C, et al. Brain metastases. *Nat Rev Dis Primers.* 2019;5(1):5.
3. Barnholtz-Sloan JS, Sloan AE, Davis FG, et al. Incidence proportions of brain metastases in patients diagnosed (1973 to 2001) in the Metropolitan Detroit Cancer Surveillance System. *J Clin Oncol.* 2004;22(14):2865--2872. doi:10.1200/JCO.2004.12.149. PMID:15254054.
4. Sperduto PW, Mesko S, Li J, et al. Survival in patients with brain metastases: summary report on the updated diagnosis-specific graded prognostic assessment and definition of the eligibility quotient. *J Clin Oncol.* 2020;38(32):3773--3784.
5. Gaspar L, Scott C, Rotman M, et al. Recursive partitioning analysis (RPA) of prognostic factors in three Radiation Therapy Oncology Group (RTOG) brain metastases trials. *Int J Radiat Oncol Biol Phys.* 1997;37(4):745--751.
6. Lin NU, Lee EQ, Aoyama H, et al. Response assessment criteria for brain metastases: proposal from the RANO group. *Lancet Oncol.* 2015;16(6):e270--e278.
7. Eisenhauer EA, Therasse P, Bogaerts J, et al. New response evaluation criteria in solid tumours: revised RECIST guideline (version 1.1). *Eur J Cancer.* 2009;45(2):228--247.
8. Le Rhun E, Guckenberger M, Smits M, et al. EANO-ESMO clinical practice guidelines for diagnosis, treatment and follow-up of patients with brain metastasis from solid tumours. *Ann Oncol.* 2021;32(11):1332--1347.
9. Vogelbaum MA, Brown PD, Messersmith H, et al. Treatment for brain metastases: ASCO-SNO-ASTRO guideline. *J Clin Oncol.* 2022;40(5):492--516.
10. Bauknecht HC, Romano VC, Rogalla P, et al. Intra- and interobserver variability of linear and volumetric measurements of brain metastases using contrast-enhanced magnetic resonance imaging. *Invest Radiol.* 2010;45(1):49--56.
11. Follwell MJ, Khu KJ, Cheng L, et al. Volume specific response criteria for brain metastases following salvage stereotactic radiosurgery and associated predictors of response. *Acta Oncol.* 2012;51(5):629--635.
12. Oft D, Schmidt MA, Weissmann T, et al. Volumetric regression in brain metastases after stereotactic radiotherapy: time course, predictors, and significance. *Front Oncol.* 2020;10:590980.
13. Ocaña-Tienda B, Pérez-Beteta J, Romero-Rosales JA, et al. Volumetric analysis: rethinking brain metastases response assessment. *Neuro-Oncol Adv.* 2024;6(1):vdad161.
14. Douri K, Iorio-Morin C, Mercure-Cyr R, et al. Response assessment in brain metastases managed by stereotactic radiosurgery: a reappraisal of the RANO-BM criteria. *Curr Oncol.* 2023;30(11):9382--9391.
15. Moawad AW, Janas A, Baid U, et al. The Brain Tumor Segmentation (BraTS-METS) Challenge 2023: brain metastasis segmentation on pre-treatment MRI. *arXiv preprint.* 2023;arXiv:2306.00838.
16. Liu Y, Stojadinovic S, Hrycushko B, et al. Deep learning-based detection and segmentation-assisted management of brain metastases. *Neuro Oncol.* 2020;22(4):505--514.
17. Isensee F, Jaeger PF, Kohl SAA, et al. nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation. *Nat Methods.* 2021;18(2):203--211.
18. Link KE, Schnurman Z, Liu C, et al. Longitudinal deep neural networks for assessing metastatic brain cancer on a large open benchmark. *Nat Commun.* 2024;15:7067.
19. Topff L, Bakkes S, Papanikolaou N, et al. A data-centric approach to improve deep learning performance for brain metastasis segmentation at MRI. *Radiology.* 2025;314(1):e240767.
20. Luo X, Yang H, Song T, et al. Automated segmentation of brain metastases with deep learning: a multi-center, randomized crossover, multi-reader evaluation study. *Neuro Oncol.* 2024;26(11):2140--2151.
21. Kickingereder P, Isensee F, Tursunova I, et al. Automated quantitative tumour response assessment of MRI in neuro-oncology with artificial neural networks: a multicentre, retrospective study. *Lancet Oncol.* 2019;20(5):728--740.
22. Kuhn HW. The Hungarian method for the assignment problem. *Nav Res Logist Q.* 1955;2(1-2):83--97.
23. Harrell FE Jr, Lee KL, Mark DB. Multivariable prognostic models: issues in developing models, evaluating assumptions and adequacy, and measuring and reducing errors. *Stat Med.* 1996;15(4):361--387.
24. Grambsch PM, Therneau TM. Proportional hazards tests and diagnostics based on weighted residuals. *Biometrika.* 1994;81(3):515--526.
25. Pencina MJ, D'Agostino RB, Steyerberg EW. Extensions of net reclassification improvement calculations to measure usefulness of new biomarkers. *Stat Med.* 2011;30(1):11--21.
26. Anderson JR, Cain KC, Gelber RD. Analysis of survival by tumor response and other comparisons of time-to-event by outcome variables. *J Clin Oncol.* 2008;26(24):3913--3915.
27. Vickers AJ, Elkin EB. Decision curve analysis: a novel method for evaluating prediction models. *Med Decis Making.* 2006;26(6):565--574.
28. Vickers AJ, Van Calster B, Steyerberg EW. Net benefit approaches to the evaluation of prediction models, molecular markers, and diagnostic tests. *BMJ.* 2016;352:i6.
29. Collins GS, Reitsma JB, Altman DG, Moons KGM. Transparent reporting of a multivariable prediction model for individual prognosis or diagnosis (TRIPOD): the TRIPOD statement. *BMJ.* 2015;350:g7594.
30. Moons KGM, Wolff RF, Riley RD, et al. PROBAST: a tool to assess risk of bias and applicability of prediction model studies: explanation and elaboration. *Ann Intern Med.* 2019;170(1):W1--W33.
31. Collins GS, Moons KGM, Dhiman P, et al. TRIPOD+AI statement: updated guidance for reporting clinical prediction models that use regression or machine learning methods. *BMJ.* 2024;385:e078378.
32. Liu X, Cruz Rivera S, Moher D, et al. Reporting guidelines for clinical trial reports for interventions involving artificial intelligence: the CONSORT-AI extension. *Nat Med.* 2020;26(9):1364--1374.
33. Kobets AJ, Backus R, Fluss R, et al. Evaluating the natural growth rate of metastatic cancer to the brain. *Surg Neurol Int.* 2020;11:254.
34. Wu J, Ding V, Luo S, et al. Predictive model to guide brain magnetic resonance imaging surveillance in patients with metastatic lung cancer: impact on real-world outcomes. *JCO Precis Oncol.* 2022;6:e2200220.
35. Nichelli L, Casagranda S. Current emerging MRI tools for radionecrosis and pseudoprogression diagnosis. *Curr Opin Oncol.* 2021;33(6):597--607.
36. Sneed PK, Mendez J, Vemer-van den Hoek JGM, et al. Adverse radiation effect after stereotactic radiosurgery for brain metastases: incidence, time course, and risk factors. *J Neurosurg.* 2015;123(2):373--386.

---

## Figure Legends

### Figure 1. Overview of the automated longitudinal volumetric assessment framework.
Multicenter MRI datasets from SNUH (training, validation, and internal test sets), Stanford, StanfordSE, and UCSF were used to develop and evaluate a two-stage longitudinal segmentation pipeline. Stage 1 employed a ten-model ensemble for single-timepoint lesion detection and segmentation; Stage 2 extended both architectures (LongResUNet and LongSwinUNETR) by incorporating prior-timepoint imaging through a Longitudinal Prior Fusion Module (LPFM) to improve specificity across serial examinations. Segmentation outputs were linked across serial MRI examinations by longitudinal tumor matching to quantify lesion-level and total intracranial volumetric trajectories. These trajectories supported automated response classification using both 1D RANO-BM–style and 3D volumetric criteria, and enabled downstream clinical analyses including treatment response evaluation, survival prediction, and exploratory risk-stratified surveillance optimization.

### Figure 2. Segmentation performance across centers, lesion sizes, and inference modes.
(A) Detection sensitivity stratified by lesion diameter (<3 mm, 3--6 mm, 6--12 mm, ≥12 mm) in single-timepoint mode across SNUH (internal), UCSF, Stanford, and StanfordSE (external). (B) Dice similarity coefficient as a function of reference lesion volume (log scale) per center, with median and interquartile range overlaid. (C) Predicted versus reference lesion volume on a logarithmic scale with identity line, demonstrating strong Spearman correlation (ρ > 0.95) across the full size range. (D) Bland-Altman agreement plot showing the difference between predicted and reference volume as a function of mean volume per center, with bias line and ±1.96 SD limits of agreement.

### Figure 3. Representative longitudinal MRI cases.
Two patients with four serial post-contrast T1-weighted MRI examinations, selected to illustrate contrasting volumetric trajectory patterns. For each case, axial slices at the level of the dominant lesion are shown at matched zoom with automated segmentation contours overlaid. Four representative timepoints (T1--T4) span the longitudinal course from baseline to later follow-up, and the accompanying tumor-volume trajectory summarizes the full time series. Cases were selected from the SNUH internal cohort to demonstrate the visual and quantitative range of volumetric dynamics captured by the automated pipeline.

### Figure 4. Discordance between 1D RANO-BM and 3D volumetric response assessment.
(A) Bland-Altman plot comparing volumetric change rate with the 1D-based volumetric approximation across evaluable scan pairs, with points colored by baseline volume category (<1, 1--4, >4 mL). Although correlation was high (Spearman ρ = 0.83), agreement was imperfect (bias -0.15; limits of agreement -1.99 to +1.69), indicating substantial lesion-level discordance despite overall trend concordance. (B) Sankey diagram showing migration of scan-pair classifications from RANO-BM categories (left: PD, SD, PR, CR) to volumetric categories (right: PD, SD, PR, CR). The dominant discordant flow is SD-to-PD reclassification: 140 of 893 scans classified as stable by 1D criteria (15.7%) were classified as progression volumetrically. (C) Row-normalized reclassification heatmap summarizing the same cross-tabulation as percentages within each 1D class. Reclassification is concentrated in the SD and PR strata, whereas PD (97.0%) and CR (100%) are largely preserved. (D) Distribution of patient-level detection time advantage, defined as the timing difference between first PD by volumetric versus 1D criteria. Among patients with non-simultaneous detection, volumetric assessment more often detected progression earlier (n = 36; median +7.0 months) than later (n = 7; median -5.4 months), while 365 patients had simultaneous detection.

### Figure 5. Survival stratification and risk-adapted surveillance.
(A) Kaplan-Meier curves stratified by longitudinal dynamic group among 953 patients with multiple timepoints. (B) Kaplan-Meier curves for four baseline volumetric burden phenotypes derived from first-scan volume and lesion count: No measurable burden, Large-volume burden, Limited burden, and Multifocal burden. (C) Forest plot showing incremental C-index improvement across nested Cox model tiers, from clinical variables alone to clinical plus baseline volume and, within the longitudinal subset, to clinical plus volume plus dynamics. (D) Decision curve analysis comparing net benefit of risk-stratified surveillance against uniform 3-month and 6-month strategies across threshold probabilities. (E) Monte Carlo simulation trade-off between scan reduction and mean detection delay for candidate surveillance strategies, with missed progression rate annotated beside each point. Detailed quantitative results for each panel are provided in the Results text.

---

## Tables

**Table 1. Baseline characteristics of the study cohort.**

| Characteristic | Overall cohort (*n* = 3,749) | Longitudinal subset (*n* = 953) |
|----------------|-----------------------------|---------------------------------|
| Patients, *n* | 3,749 | 953 |
| MRI scans, *n* | 6,365 | 3,569 |
| MRI scans per patient, median (IQR) | 1 (1–2) | 3 (2–5) |
| Age, median (IQR), y | 67 (58–75) | 65 (57–73) |
| Male sex, *n* (%) | 1,910 (50.9%) | 443 (46.5%) |
| Post-treatment at baseline, *n* (%) | 915 (24.4%) | 404 (42.4%) |
| **Primary cancer** | | |
| &emsp;Lung | 2,054 (54.8%) | 624 (65.5%) |
| &emsp;Breast | 530 (14.1%) | 143 (15.0%) |
| &emsp;Other | 865 (23.1%) | 131 (13.7%) |
| &emsp;Renal | 124 (3.3%) | 33 (3.5%) |
| &emsp;Liver | 90 (2.4%) | 14 (1.5%) |
| &emsp;Lymphoma | 86 (2.3%) | 8 (0.8%) |
| Visible measurable intracranial tumor burden at baseline, *n* (%) | 1,244 (33.2%) | 672 (70.5%) |
| No visible measurable intracranial tumor burden at baseline, *n* (%) | 2,505 (66.8%) | 281 (29.5%) |
| Baseline lesion count, median (IQR) [burden-positive only] | 3 (1–7) | 3 (1–6) |
| Baseline total tumor volume, median (IQR), mm³ [burden-positive only] | 1,614 (185–9,227) | 1,090 (159–6,504) |
| Largest lesion diameter, median (IQR), mm [burden-positive only] | 21.9 (9.0–42.8) | 19.7 (8.8–38.8) |

IQR = interquartile range. The longitudinal subset comprises patients with two or more MRI timepoints. Burden-positive = at least one measurable lesion at baseline.

---

**Table 2. Incremental prognostic value of volumetric features and survival model coefficients.**

**A. Nested Cox model discrimination**

| Model | Cohort | *N* | C-index | Incremental comparison |
|-------|--------|-----|---------|------------------------|
| M1: Clinical only | Full | 3,749 | 0.590 | Reference |
| M2: Clinical + Volume (single-TP) | Full | 3,749 | 0.615 | +0.025 (95% CI 0.015–0.037) vs. M1 |
| M2b: Clinical + Volume (longitudinal) | Multi-timepoint | 953 | 0.642 | Reference within multi-timepoint subset |
| M3: Clinical + Volume + Dynamics | Multi-timepoint | 953 | 0.679 | +0.037 vs. M2b |

M1 vs. M2 and M2b vs. M3 are the within-cohort incremental comparisons of interest. M1–M2 (full cohort) and M2b–M3 (longitudinal subset) are not directly comparable owing to differing sample composition.

**B. Selected multivariable Cox model coefficients (scan-level cluster-robust analysis)**

| Covariate | HR (95% CI) | *p*-value |
|-----------|-------------|-----------|
| Age (years) | 1.00 (1.00–1.01) | 0.010 |
| Male sex | 1.26 (1.15–1.38) | <0.001 |
| log(Total volume, mm³) | 1.03 (0.99–1.06) | 0.122 |
| Lesion count | 1.01 (1.01–1.01) | <0.001 |
| Largest lesion diameter (mm) | 1.00 (1.00–1.00) | 0.925 |
| Prior treatment | 0.97 (0.88–1.07) | 0.589 |
| Growth rate (mm³/day) | 1.00 (1.00–1.00) | 0.193 |
| New lesion rate (per month) | 1.00 (0.99–1.00) | 0.007 |
| Time-weighted avg log(volume) | 1.01 (0.99–1.04) | 0.348 |
| Primary: Liver (ref = Breast) | 1.96 (1.51–2.56) | <0.001 |
| Primary: Lung | 0.82 (0.71–0.95) | 0.008 |
| Primary: Lymphoma | 1.24 (0.91–1.70) | 0.173 |
| Primary: Other | 1.59 (1.36–1.87) | <0.001 |
| Primary: Renal | 0.94 (0.71–1.26) | 0.699 |

HR = hazard ratio; CI = confidence interval; TP = timepoint.

---

## Supplementary Material

### Supplementary Methods
Full architectural details, training hyperparameters, data augmentation pipeline, and evaluation metrics are provided in the accompanying Supplementary Material document.

### Supplementary Tables

**Table S1.** TRIPOD+AI reporting checklist (provided in accompanying Supplementary Material document).

**Table S2a.** Detection performance report for single-timepoint inference, with center-wise and size-stratified lesion-, scan-, and patient-level metrics.

**Table S2b.** Detection performance report for temporal inference, with center-wise and size-stratified lesion-, scan-, and patient-level metrics.

**Table S2c.** Detection performance report pooling all available modes/centers, summarizing the overall technical performance used for manuscript reporting.

**Table S3a.** Segmentation quality report for single-timepoint inference, including DSC, NSD, and HD95 across centers and lesion size strata.

**Table S3b.** Segmentation quality report for temporal inference, including DSC, NSD, and HD95 across centers and lesion size strata.

**Table S3c.** Segmentation quality report pooling all available modes/centers, summarizing the overall segmentation quality profile.

**Table S4a.** Incremental prognostic value results including bootstrap C-index confidence intervals, within-cohort C-index increments, and reclassification statistics.

**Table S4b.** Cox proportional hazards model results including multivariate models and cluster-robust versus naive standard error comparison.

**Table S5.** Model architecture comparison for single-timepoint and temporal inference, including detection and segmentation metrics for individual backbone models and the ensemble.
