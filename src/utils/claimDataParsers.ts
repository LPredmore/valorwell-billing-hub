
/**
 * Utility functions for parsing complex claim data from various sources
 */

// Common CARC (Claim Adjustment Reason Code) descriptions
export const CARC_DESCRIPTIONS: Record<string, string> = {
  '1': 'Deductible amount',
  '2': 'Coinsurance amount',
  '3': 'Copayment amount',
  '4': 'The procedure code is inconsistent with the modifier used',
  '5': 'The procedure code/modifier combination is invalid',
  '11': 'The diagnosis is inconsistent with the procedure',
  '16': 'Claim/service lacks information',
  '18': 'Duplicate claim/service',
  '22': 'This care may be covered by another payer',
  '23': 'The impact of prior payer(s) adjudication',
  '24': 'Charges are covered under a capitation agreement',
  '26': 'Expenses incurred prior to coverage',
  '27': 'Expenses incurred after coverage terminated',
  '29': 'The time limit for filing has expired',
  '31': 'Patient cannot be identified as our insured',
  '32': 'Our records indicate that this dependent is not an eligible dependent',
  '33': 'Insured has no dependent coverage',
  '34': 'Insured has no coverage for this service',
  '35': 'Lifetime benefit maximum has been reached',
  '39': 'Services denied at the time authorization/pre-certification was requested',
  '40': 'Charges do not meet qualifications for emergent/urgent care',
  '45': 'Charge exceeds fee schedule/maximum allowable or contracted/legislated fee arrangement',
  '50': 'These are non-covered services because this is not deemed a medical necessity',
  '51': 'These are non-covered services because this is a pre-existing condition',
  '53': 'Services by an immediate relative or a member of the same household are not covered',
  '54': 'Multiple physicians/assistants are not covered in this case',
  '55': 'Procedure/treatment is deemed experimental/investigational',
  '56': 'Procedure/treatment has not been deemed proven to be effective',
  '58': 'Treatment was deemed by the payer to be medically unnecessary',
  '59': 'Processed based on multiple or concurrent procedure rules',
  '60': 'Charges for outpatient services with this date of service are covered under a comprehensive outpatient rehabilitation facility payment',
  '96': 'Non-covered charge(s)',
  '97': 'The benefit for this service is included in the payment/allowance for another service/procedure',
  '109': 'Claim not covered by this payer/contractor',
  '110': 'Billing date predates service date',
  '111': 'Not covered unless the provider accepts assignment',
  '112': 'Service not furnished directly to the patient and/or not documented',
  '114': 'Procedure/product not approved by the Food and Drug Administration',
  '119': 'Benefit maximum for this time period or occurrence has been reached',
  '125': 'Submission/billing error(s)',
  '129': 'Prior processing information appears incorrect',
  '131': 'Claim specific negotiated discount',
  '132': 'Prearranged demonstration project adjustment',
  '133': 'The disposition of the claim/service is undetermined during the premium payment grace period',
  '134': 'Technical direction/supervision of diagnostic tests requires interpretation by a physician',
  '135': 'Interim bills cannot be processed',
  '136': 'Failure to follow prior payer's coverage rules',
  '137': 'Regulatory surcharges, assessments, allowances or health related taxes',
  '138': 'Appeal procedures not followed or time limits not met',
  '139': 'Contracted funding agreement',
  '140': 'Patient/insured health identification number and name do not match',
  '142': 'Monthly Medicaid patient liability amount',
  '143': 'Portion of payment deferred',
  '144': 'Incentive adjustment',
  '146': 'Diagnosis was invalid for the date(s) of service reported',
  '147': 'Provider contracted/negotiated rate expired',
  '148': 'Information from another provider was not provided or was insufficient/incomplete',
  '149': 'Lifetime psychiatric benefit maximum has been reached',
  '150': 'Payer deems the information submitted does not support this level of service',
  '151': 'Payment adjusted because the payer deems the information submitted does not support this many/frequency of services',
  '152': 'Payer deems the information submitted does not support this length of service',
  '153': 'Payer deems the information submitted does not support this dosage',
  '154': 'Benefit restrictions do not allow payment for this service/procedure',
  '155': 'Patient refused the service/procedure',
  '156': 'Payer deems this service/procedure to have been addressed by a previously paid service/procedure',
  '157': 'Service/procedure was provided as a result of an act of third party liability',
  '158': 'Service/procedure was provided as a result of a work related injury/illness',
  '159': 'Service/procedure was provided as a result of an automobile accident',
  '160': 'Injury/illness was covered by the liability carrier',
  '161': 'Provider performance bonus',
  '162': 'State Medicaid plan does not cover this service for this type of recipient',
  '163': 'Attachment referenced on the claim was not received',
  '164': 'Administered vaccine is reported on the claim',
  '165': 'Advance patient payments',
  '166': 'These services were submitted after this payer's filing period',
  '167': 'This (these) diagnosis(es) is (are) not covered',
  '168': 'Service(s) not covered when performed in this place of service',
  '169': 'Alternate benefit has been provided',
  '170': 'Payment is denied when performed/billed by this type of provider',
  '171': 'Payment is denied when performed/billed by this type of provider in this type of facility',
  '172': 'Payment is adjusted when performed/billed by a provider of this specialty',
  '173': 'Service/equipment was not prescribed by a physician',
  '174': 'Service was not prescribed by a physician',
  '175': 'Prescription is incomplete',
  '176': 'Prescription is not current',
  '177': 'Patient has not met the required eligibility requirements',
  '178': 'Patient has not met the required spend down requirements',
  '179': 'Billed in excess of interim rate',
  '180': 'Referral absent or exceeded',
  '181': 'Procedure code was invalid on the date of service',
  '182': 'Procedure modifier was invalid on the date of service',
  '183': 'The referring provider is not eligible to refer the service billed',
  '184': 'The referring provider is not on file with the payer',
  '185': 'The rendering provider is not eligible to perform the service billed',
  '186': 'Level of care change adjustment',
  '187': 'Consumer Spending Account payments',
  '188': 'This product/procedure is only covered when used according to FDA recommendations',
  '189': 'Not otherwise classified or unlisted procedure code',
  '190': 'Payment is included in the allowance for a Skilled Nursing Facility visit',
  '191': 'Not a work-related injury/illness',
  '192': 'Non-standard adjustment code from paper remittance',
  '193': 'Original payment decision is being maintained',
  '194': 'Anesthesia performed by the operating physician',
  '195': 'Refund issued to an erroneous priority payer',
  '197': 'Precertification/authorization/notification absent',
  '198': 'Precertification/authorization exceeded',
  '199': 'Revenue code and Procedure code do not match',
  '200': 'Expenses incurred during lapse in coverage',
  '201': 'Patient is responsible for amount of this claim/service through copayment',
  '202': 'Non-emergency transportation',
  '203': 'Discontinued or reduced service',
  '204': 'This service/equipment/drug is not covered under the patient benefit plan',
  '205': 'Pharmacy discount card processing fee',
  '206': 'National Provider Identifier - missing',
  '207': 'National Provider Identifier - invalid format',
  '208': 'National Provider Identifier - not matched',
  '209': 'Per regulatory or other agreement',
  '210': 'Payment adjusted because pre-certification/authorization not received in a timely fashion',
  '211': 'Electronic interchange agreement not in effect',
  '212': 'Administrative surcharges are not covered',
  '213': 'Non-compliance with the Medicare secondary payer resolution process',
  '214': 'Workers Compensation case settled',
  '215': 'Based on subrogation of a third party settlement',
  '216': 'Based on the findings of a review organization',
  '217': 'Based on payer reasonable and customary fees',
  '218': 'Based on entitlement to benefits',
  '219': 'Based on extent of injury',
  '220': 'The applicable fee schedule/fee database does not contain the billed code',
  '221': 'Patient Medicare deductible on this claim',
  '222': 'Exceeds the contracted maximum number of units by this provider for this period',
  '223': 'Adjustment code for mandated federal, state or local law/regulation',
  '224': 'Patient responsibility amount for this claim',
  '225': 'The submitted procedure/revenue code was modified or altered',
  '226': 'Information requested from the Billing Provider was not provided or was insufficient',
  '227': 'Information requested from the patient/insured/responsible party was not provided or was insufficient',
  '228': 'Denied for failure of this provider to enroll with the payer',
  '229': 'Partial charge amount not covered by the primary payer',
  '230': 'Amounts withheld from payment per regulatory requirement',
  '231': 'Mutually exclusive procedure cannot be done in the same session/date',
  '232': 'Institutional Transfer Amount',
  '233': 'Services/charges related to the treatment of a hospital-acquired condition or preventable medical error',
  '234': 'This procedure is not paid separately',
  '235': 'Sales Tax',
  '236': 'State mandate requires a review of this service',
  '237': 'Legislated/Regulatory Penalty',
  '238': 'Claim spans eligible and ineligible periods of coverage',
  '239': 'Claim spans eligible and ineligible periods of coverage',
  '240': 'Monetary penalty',
  '241': 'Claim spans eligible and ineligible periods of coverage',
  '242': 'Services not provided by network/primary care providers',
  '243': 'Services not authorized by network/primary care providers',
  '244': 'Payment denied because only one visit or consultation per physician per day is covered',
  '245': 'Provider performance program withhold',
  '246': 'This non-payable code is for required reporting only',
  '247': 'Deductible carryover from previous calendar year',
  '248': 'Coinsurance carryover from previous calendar year',
  '249': 'Copayment carryover from previous calendar year',
  '250': 'Non-Payable Procedure Code',
  '251': 'Primary care service',
  '252': 'Administrative costs',
  '253': 'Sequestration reduction',
  '254': 'Claim received by the payer in the previous calendar/fiscal year',
  '255': 'Claim spans eligible and ineligible periods of coverage',
  '256': 'Claim spans eligible and ineligible periods of coverage',
  '257': 'Provider does not have a priority access vendor/network contract',
  '258': 'Claim adjustment reason code for mandated federal, state or local law/regulation',
  '259': 'Provider performance bonus',
  '260': 'Processed under Medicaid ACA Enhanced Services',
  '261': 'The procedure or service is inconsistent with the patient age',
  '262': 'The procedure or service is inconsistent with the patient gender',
  '263': 'The procedure or service is inconsistent with the provider type',
  '264': 'The procedure or service is inconsistent with the place of service',
  '265': 'The procedure or service is inconsistent with the provider specialty',
  '266': 'Missing or invalid patient diagnosis',
  '267': 'Claim adjustment reason code for failure to include additional documentation',
  '268': 'Claim adjustment reason code for failure to include additional documentation',
  '269': 'Claim adjustment reason code for failure to include additional documentation',
  '270': 'Claim adjustment reason code for failure to include additional documentation',
  '271': 'Prior authorization request was not submitted according to requirements',
  '272': 'Coverage/program guidelines were not met',
  '273': 'Coverage/program guidelines were not met',
  '274': 'Fee exceeds maximum allowable for services provided by Students, Residents, or Interns',
  '275': 'Prior payer's (or payers') patient responsibility (deductible, coinsurance, copayment, etc.) has been satisfied',
  '276': 'Services denied by the prior payer(s) are not covered by this payer',
  '277': 'The disposition of the claim/service is pending further review',
  '278': 'Claim/service adjusted due to incorrect provider specialty',
  '279': 'Claim/service adjusted due to incorrect facility type',
  '280': 'Claim/service adjusted due to incorrect facility type',
  '281': 'Primary care provider (PCP) denial',
  '282': 'Adjustment code for Air Ambulance Federal or State fee schedule',
  '283': 'Appeal procedures not followed or time limits not met',
  '284': 'The prescribing/ordering provider is not eligible to prescribe/order the service billed',
  '285': 'Appeal procedures not followed or time limits not met',
  '286': 'Appeal denied',
  '287': 'Transfer amount',
  '288': 'Conditional payment',
  '289': 'Claim spans multiple calendar or fiscal years',
  '290': 'Primary diagnosis and procedure are inconsistent',
  '291': 'The procedure or service is experimental/investigational',
  '292': 'Claim level adjustment',
  '293': 'Claim spans eligible and ineligible periods of coverage',
  '294': 'Claim received by the payer after the claim filing period expiration date',
  '295': 'Plan procedures not followed',
  '296': 'Pre-authorization exceeded',
  '297': 'The procedure or service requires a referral',
  '298': 'Claim adjusted because the performing provider is not the referring provider',
  '299': 'Claim adjusted because the referring provider is not the attending provider',
  '300': 'Claim adjusted because the referring provider is not the attending provider',
  '301': 'Claim adjusted because the diagnosis and procedure are inconsistent',
  '302': 'Claim adjusted because the referring provider is not the attending provider',
  '303': 'Claim adjusted because the diagnosis and procedure are inconsistent',
  '304': 'Claim adjusted because the referring provider is not the attending provider',
  '305': 'Claim adjusted because the diagnosis and procedure are inconsistent',
  '306': 'Claim adjusted because the referring provider is not the attending provider',
  '307': 'Claim adjusted because the diagnosis and procedure are inconsistent',
  '308': 'Claim adjusted because the referring provider is not the attending provider',
  '309': 'Claim adjusted because the diagnosis and procedure are inconsistent',
  '310': 'Claim adjusted because the referring provider is not the attending provider',
  'A0': 'Patient refund amount',
  'A1': 'Claim denied charges',
  'A2': 'Contractual adjustment',
  'A3': 'Adjustment for failure to obtain second surgical opinion',
  'A4': 'Adjustment for failure to obtain pre-certification/authorization',
  'A5': 'Medicare secondary payer adjustment',
  'A6': 'Prior payment adjustment',
  'A7': 'Payor-initiated reduction',
  'A8': 'Adjustment for failure to submit an appeal within time limits',
  'B1': 'Non-covered visits',
  'B2': 'Adjustment for no-fault insurance',
  'B3': 'Adjustment for workers compensation',
  'B4': 'Adjustment for auto insurance',
  'B5': 'Adjustment for coverage by another insurance',
  'B6': 'Adjustment for government insurance',
  'B7': 'Adjustment for supplemental insurance',
  'B8': 'Adjustment for overlapping insurance',
  'B9': 'Adjustment for coordination of benefits',
  'B10': 'Adjustment for co-payment',
  'B11': 'Adjustment for deductible',
  'B12': 'Adjustment for non-covered charges',
  'B13': 'Adjustment for procedure/service not covered',
  'B14': 'Adjustment for procedure/service is not a covered benefit',
  'B15': 'Adjustment for procedure is investigational',
  'B16': 'Adjustment for brand name drug when generic available'
};

// Common RARC (Remittance Advice Remark Code) descriptions
export const RARC_DESCRIPTIONS: Record<string, string> = {
  'M1': 'X-ray not taken within the past 12 months or near enough to admission',
  'M2': 'Not paid separately when the patient is an inpatient',
  'M3': 'Equipment depreciation claimed in prior year',
  'M4': 'Alert: This service may be subject to medical review',
  'M5': 'Alert: Incorrect patient identification number used',
  'M6': 'Alert: Original Medicare claim not on file',
  'M7': 'Alert: The procedure performed may not match the procedure billed',
  'M8': 'Alert: Claim may be processed in accordance with Medicare guidelines',
  'M9': 'Alert: Diagnosis may not match the procedure performed',
  'M10': 'Alert: Care may not meet criteria for coverage',
  'M11': 'Alert: Billing exceeds usual fee schedule',
  'M12': 'Alert: Diagnosis codes must be provided to the highest level of specificity available',
  'M13': 'Alert: Only one initial visit per specialty per patient is covered',
  'M14': 'Alert: Only one visit per patient per day is covered by this payer',
  'M15': 'Alert: Separately billed services/tests have been bundled',
  'M16': 'Alert: See documentation guidelines for evaluation and management services',
  'M20': 'Alert: Missing/incomplete/invalid HCPCS',
  'M21': 'Alert: Missing/incomplete/invalid modifier',
  'M22': 'Alert: Remittance advice and claim summary totals do not agree',
  'M23': 'Alert: Impact of prior payer(s) adjudication includes payments and/or adjustments',
  'M24': 'Alert: Insert appropriate fee schedule amount',
  'M25': 'Alert: Patient did not meet criteria for emergent/urgent care',
  'M26': 'Alert: Patient ineligible for this service',
  'M27': 'Alert: Patient has been notified that you may not accept assignment',
  'M28': 'Alert: Patient has been notified that treatment was furnished by a physician',
  'M29': 'Alert: Patient notified that the services were rendered in a facility',
  'M30': 'Alert: Patient responsibility (deductible/coinsurance/co-payment)',
  'M31': 'Alert: Patient responsibility (amount applied to deductible)',
  'M32': 'Alert: Patient responsibility (amount applied to copay)',
  'M33': 'Alert: Patient responsibility (amount applied to coinsurance)',
  'M34': 'Alert: Claim submitted as unassigned but processed as assigned',
  'M35': 'Alert: Service denied because treatment has not been deemed proven to be effective',
  'M36': 'Alert: Service denied because it is unproven as an effective treatment',
  'M37': 'Alert: Service denied because it is not medically necessary',
  'M38': 'Alert: Service denied because procedure/treatment is deemed experimental',
  'M39': 'Alert: Service not covered when performed as preventive care',
  'M40': 'Alert: Service not covered when performed for cosmetic purposes',
  'M41': 'Alert: Claim spans multiple years',
  'M42': 'Alert: Adjusted based on Medicare cost report',
  'M43': 'Alert: Adjusted for incorrect admission date',
  'M44': 'Alert: Adjusted for incorrect discharge date',
  'M45': 'Alert: Adjusted for incorrect patient status',
  'M46': 'Alert: Adjusted for incorrect condition code',
  'M47': 'Alert: Adjusted for incorrect revenue code',
  'M48': 'Alert: Adjusted for incorrect HCPCS/CPT code',
  'M49': 'Alert: Adjusted for incorrect DRG',
  'M50': 'Alert: Adjusted for incorrect modifier',
  'M51': 'Alert: Alert: Missing/incomplete/invalid Principal Diagnosis',
  'M52': 'Alert: Missing/incomplete/invalid attending physician identification',
  'M53': 'Alert: Missing/incomplete/invalid other physician identification',
  'M54': 'Alert: Missing/incomplete/invalid facility identification',
  'M55': 'Alert: Procedure modifier not appropriate with procedure code billed',
  'M56': 'Alert: Procedure and diagnosis are inconsistent',
  'M57': 'Alert: Procedure was incident to a physicians service',
  'M58': 'Alert: Procedure was performed by a facility/supplier not approved for this procedure',
  'M59': 'Alert: Procedure was performed in an inappropriate place of service',
  'M60': 'Alert: Service already adjudicated on a previous claim',
  'M61': 'Alert: Missing/incomplete/invalid procedure modifier',
  'M62': 'Alert: Alert: Missing/incomplete/invalid principal procedure date',
  'M63': 'Alert: Missing/incomplete/invalid other procedure date',
  'M64': 'Alert: Alert: Procedure date inconsistent with the dates of service',
  'M65': 'Alert: Procedure not appropriate with patient age',
  'M66': 'Alert: Procedure not appropriate with patient gender',
  'M67': 'Alert: Unrelated procedure or service',
  'M68': 'Alert: Day outlier amount',
  'M69': 'Alert: Cost outlier - Adjustment to compensate for additional costs',
  'M70': 'Alert: Service denied because payment has already been made for this same/similar procedure within a set timeframe',
  'M71': 'Alert: Service denied because payment would be inappropriate (e.g., payment has already been made)',
  'M72': 'Alert: Alert: No/invalid prescription provided',
  'M73': 'Alert: Service denied because the information submitted does not support medical necessity',
  'M74': 'Alert: Service denied because treatment exceeds the approved number of visits/units per calendar year',
  'M75': 'Alert: Covered only when performed as part of a composite service',
  'M76': 'Alert: Service denied because treatment exceeds the approved number of visits per episode',
  'M77': 'Alert: Service denied because treatment exceeds the approved duration',
  'M78': 'Alert: Service denied because the supporting documentation does not substantiate that the services rendered were at the level billed',
  'M79': 'Alert: Service denied because treatment was not rendered by the appropriate type of provider for this procedure',
  'M80': 'Alert: Service not covered when performed during the same encounter/visit as another service',
  'M81': 'Alert: Service not covered when billed for multiple units/days/visits in excess of policy limitations',
  'M82': 'Alert: Service not covered when performed/billed by this type of provider',
  'M83': 'Alert: No coverage when a screening exam is done in combination with a routine exam',
  'M84': 'Alert: Alert: No coverage when the patient is asymptomatic, has no family history of disease, and has no patient or physician initiated complaints',
  'M85': 'Alert: Service not covered when performed for multiple procedures on the same date',
  'M86': 'Alert: Service denied because the procedure/service was not performed',
  'M87': 'Alert: Transfer to post-acute care provider',
  'M88': 'Alert: Services not covered when performed in this place of service',
  'M89': 'Alert: Alert: Service not covered when performed in combination with the same service on the same date',
  'M90': 'Alert: Alert: Service not covered when performed for this diagnosis',
  'M91': 'Alert: Alert: Service denied because patient was not seen within the required timeframe for this service',
  'M92': 'Alert: Service not covered when performed by this type of provider for this diagnosis',
  'M93': 'Alert: Services not covered when performed before the minimum age requirement',
  'M94': 'Alert: Services not covered when performed after the maximum age requirement',
  'M95': 'Alert: Services not covered when performed more than the maximum number of times per time period',
  'M96': 'Alert: Services not covered when performed less than the minimum number of days since the last visit',
  'M97': 'Alert: Services not covered when performed within a designated time period of another procedure',
  'M98': 'Alert: Services not covered when performed outside of a designated time period',
  'M99': 'Alert: Services not covered for certain diagnoses when performed with other services',
  'M100': 'Alert: Services not covered when performed during certain seasons/dates',
  'M101': 'Alert: Service not covered when performed for experimental/research purposes',
  'M102': 'Alert: Service not covered when performed by multiple providers on the same date of service',
  'M103': 'Alert: Service not covered when performed more than the allowed number of times in a calendar year',
  'M104': 'Alert: Services not covered when performed within a designated post-operative period',
  'M105': 'Alert: Alert: Services not covered when performed on the same date as another procedure',
  'M106': 'Alert: Services not covered when performed as a screening service',
  'M107': 'Alert: Alert: Services not covered when performed as a routine/preventive service',
  'M108': 'Alert: Services not covered when performed for cosmetic purposes',
  'M109': 'Alert: Alert: Services not covered when performed for this indication',
  'M110': 'Alert: Alert: Services not covered when performed without the appropriate referral',
  'M111': 'Alert: Alert: Services not covered when performed without proper authorization',
  'M112': 'Alert: Alert: Service not covered when performed without meeting the required criteria',
  'M113': 'Alert: Alert: Service not covered when performed by an uncredentialed provider',
  'M114': 'Alert: Alert: Service denied because it was performed by a provider that is not in the patient network',
  'M115': 'Alert: Alert: Service not covered when performed outside the designated geographic area',
  'M116': 'Alert: Alert: Service not covered when the patient did not meet prior authorization requirements',
  'M117': 'Alert: Alert: Service not covered when performed without meeting the step therapy requirements',
  'M118': 'Alert: Alert: Service not covered when performed without meeting utilization management requirements',
  'M119': 'Alert: Alert: Service not covered when performed during certain times',
  'M120': 'Alert: Alert: Service not covered when performed on an outpatient basis',
  'M121': 'Alert: Alert: Service not covered when performed on an inpatient basis',
  'M122': 'Alert: Alert: Service not covered when performed in this place of service for this diagnosis',
  'M123': 'Alert: Alert: Service not covered when performed by this provider type for this diagnosis',
  'M124': 'Alert: Alert: Service not covered when performed for this member',
  'M125': 'Alert: Alert: Service not covered when performed at this facility',
  'M126': 'Alert: Alert: Service not covered when performed with this modifier',
  'M127': 'Alert: Alert: Service not covered when performed for members residing in this geographic area',
  'M128': 'Alert: Alert: Service not covered when performed for certain diagnoses',
  'M129': 'Alert: Alert: Service not covered when performed for members of this age group',
  'M130': 'Alert: Alert: Service not covered when performed for members of this gender',
  'N1': 'Alert: You may appeal this decision',
  'N2': 'Alert: This allowance has been issued in accordance with your Medical staff bylaws',
  'N3': 'Alert: Missing consent form',
  'N4': 'Alert: Alert: Missing/incomplete/invalid prior authorization number',
  'N5': 'Alert: Alert: Procedure was not approved for this provider',
  'N6': 'Alert: Alert: Alert: Procedure not covered for this provider type',
  'N7': 'Alert: Alert: Claim/service may be subject to medical review',
  'N8': 'Alert: Alert: Alert: Provider performance program payment adjustment',
  'N9': 'Alert: Alert: Alert: Alert: Procedure/services are not reimbursable under the fee-for-service system',
  'N10': 'Alert: Alert: Alert: Alert: Alert: Patient responsibility may be applicable'
};

/**
 * Parse Claim.MD response data into structured format
 */
export const parseClaimMdResponse = (responseData: any) => {
  if (!responseData) return null;

  return {
    acknowledgmentId: responseData.acknowledgment_id || null,
    batchId: responseData.batch_id || null,
    statusMessage: responseData.status_message || responseData.message || null,
    errorCode: responseData.error_code || null,
    errorMessage: responseData.error_message || responseData.error || null,
    submissionStatus: responseData.submission_status || null,
    processedClaims: responseData.claims || responseData.processed_claims || [],
    transactionId: responseData.transaction_id || null,
    responseDate: responseData.response_date || null,
    rawData: responseData
  };
};

/**
 * Parse denial details into structured format
 */
export const parseDenialDetails = (denialData: any) => {
  if (!denialData) return null;

  const result = {
    primaryReason: null as string | null,
    secondaryReasons: [] as string[],
    adjustmentCodes: [] as Array<{code: string, description: string}>,
    remarkCodes: [] as Array<{code: string, description: string}>,
    denialAmount: null as number | null,
    appealDeadline: null as string | null,
    correctionInstructions: null as string | null,
    rawData: denialData
  };

  if (typeof denialData === 'string') {
    result.primaryReason = denialData;
  } else if (typeof denialData === 'object') {
    // Extract primary reason
    result.primaryReason = denialData.reason || denialData.denial_reason || denialData.primary_reason || null;

    // Extract secondary reasons
    if (Array.isArray(denialData.reasons)) {
      result.secondaryReasons = denialData.reasons;
    } else if (Array.isArray(denialData.secondary_reasons)) {
      result.secondaryReasons = denialData.secondary_reasons;
    }

    // Extract adjustment codes with descriptions
    const adjCodes = denialData.adjustment_codes || denialData.carc_codes || [];
    if (Array.isArray(adjCodes)) {
      result.adjustmentCodes = adjCodes.map((code: string) => ({
        code,
        description: CARC_DESCRIPTIONS[code] || 'Unknown adjustment reason'
      }));
    }

    // Extract remark codes with descriptions
    const remarkCodes = denialData.remark_codes || denialData.rarc_codes || [];
    if (Array.isArray(remarkCodes)) {
      result.remarkCodes = remarkCodes.map((code: string) => ({
        code,
        description: RARC_DESCRIPTIONS[code] || 'Unknown remark'
      }));
    }

    // Extract other fields
    result.denialAmount = denialData.denied_amount || denialData.denial_amount || null;
    result.appealDeadline = denialData.appeal_deadline || denialData.appeal_by_date || null;
    result.correctionInstructions = denialData.correction_instructions || denialData.instructions || null;
  }

  return result;
};

/**
 * Parse insurance adjustment details
 */
export const parseAdjustmentDetails = (adjustmentData: any) => {
  if (!adjustmentData) return null;

  const result = {
    adjustments: [] as Array<{
      code: string;
      amount: number;
      description: string;
      type: 'contractual' | 'denial' | 'correction' | 'other';
    }>,
    totalAdjustment: 0,
    contractualAdjustments: 0,
    denialAdjustments: 0,
    correctionAdjustments: 0,
    rawData: adjustmentData
  };

  const processAdjustment = (adj: any) => {
    const code = adj.code || adj.adjustment_code || 'Unknown';
    const amount = Number(adj.amount || adj.adjustment_amount || 0);
    const description = adj.description || adj.reason || CARC_DESCRIPTIONS[code] || 'No description';
    const type = determineAdjustmentType(code);
    
    const adjustment = { code, amount, description, type };
    result.adjustments.push(adjustment);
    result.totalAdjustment += amount;
    
    switch (type) {
      case 'contractual':
        result.contractualAdjustments += amount;
        break;
      case 'denial':
        result.denialAdjustments += amount;
        break;
      case 'correction':
        result.correctionAdjustments += amount;
        break;
    }
  };

  if (Array.isArray(adjustmentData)) {
    adjustmentData.forEach(processAdjustment);
  } else if (typeof adjustmentData === 'object') {
    processAdjustment(adjustmentData);
  }

  return result;
};

/**
 * Determine adjustment type based on CARC code
 */
export const determineAdjustmentType = (code: string): 'contractual' | 'denial' | 'correction' | 'other' => {
  if (!code) return 'other';
  
  const codeNum = parseInt(code);
  
  // CARC code categorization
  if (codeNum >= 1 && codeNum <= 99) return 'contractual';
  if (codeNum >= 100 && codeNum <= 199) return 'denial';
  if (codeNum >= 200 && codeNum <= 299) return 'correction';
  
  // Handle text-based codes
  const lowerCode = code.toLowerCase();
  if (lowerCode.includes('contractual') || lowerCode.includes('network') || lowerCode.includes('discount')) return 'contractual';
  if (lowerCode.includes('denial') || lowerCode.includes('deny') || lowerCode.includes('reject')) return 'denial';
  if (lowerCode.includes('correction') || lowerCode.includes('correct') || lowerCode.includes('adjust')) return 'correction';
  
  return 'other';
};

/**
 * Get human-readable status descriptions
 */
export const getStatusDescription = (status: string): string => {
  const statusMap: Record<string, string> = {
    'submitted': 'Claim has been submitted and is being processed',
    'accepted': 'Claim has been accepted by the clearinghouse',
    'rejected': 'Claim was rejected due to errors',
    'paid': 'Claim has been processed and payment issued',
    'denied': 'Claim was denied by the insurance provider',
    'pending': 'Claim is pending review',
    'processing': 'Claim is currently being processed',
    'acknowledgment_received': 'Submission acknowledgment received from clearinghouse',
    'submitted_to_clearinghouse': 'Claim submitted to clearinghouse for processing',
    'payment_received': 'Payment has been received for this claim',
    'partial_payment': 'Partial payment received, additional processing may be needed',
    'under_review': 'Claim is under review by the insurance provider',
    'appeal_pending': 'Appeal has been submitted and is pending review',
    'appealed': 'Claim has been appealed',
    'resubmitted': 'Claim has been resubmitted after corrections'
  };
  
  return statusMap[status.toLowerCase()] || status;
};

/**
 * Format currency values consistently
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

/**
 * Calculate financial summary metrics
 */
export const calculateFinancialSummary = (financial: {
  billed_amount: number;
  insurance_paid_amount: number | null;
  patient_responsibility_amount: number | null;
  insurance_adjustment_amount: number | null;
}) => {
  const billedAmount = financial.billed_amount || 0;
  const insurancePaid = financial.insurance_paid_amount || 0;
  const patientResponsibility = financial.patient_responsibility_amount || 0;
  const adjustmentAmount = financial.insurance_adjustment_amount || 0;
  
  const totalRecovered = insurancePaid + patientResponsibility;
  const outstandingBalance = billedAmount - totalRecovered - adjustmentAmount;
  const recoveryRate = billedAmount > 0 ? (totalRecovered / billedAmount) * 100 : 0;
  
  return {
    billedAmount,
    insurancePaid,
    patientResponsibility,
    adjustmentAmount,
    totalRecovered,
    outstandingBalance,
    recoveryRate: Math.round(recoveryRate),
    isFullyPaid: totalRecovered >= billedAmount,
    isPartiallyPaid: totalRecovered > 0 && totalRecovered < billedAmount,
    isUnpaid: totalRecovered === 0
  };
};
