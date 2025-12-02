/**
 * Experiment allocation information types
 */

/**
 * Details about user hash bucketing for allocation
 */
export interface HashDetails {
  /**
   * User hash bucket (1-100) - used for consistent allocation
   */
  hashedUserIdBucket1To100?: number;

  /**
   * User ID that was hashed for allocation
   */
  hashedUserId?: string;

  /**
   * Hash method used (e.g., "HASH_USER_ID", "HASH_HELIUM_PERSISTENT_ID")
   */
  hashMethod?: string;
}

/**
 * Details about the chosen variant in an experiment
 */
export interface VariantDetails {
  /**
   * Name or identifier of the allocation/variant (e.g., paywall template name)
   */
  allocationName?: string;

  /**
   * Unique identifier for this allocation (paywall UUID)
   */
  allocationId?: string;

  /**
   * Index of chosen variant (1 to len(variants))
   */
  allocationIndex?: number;

  /**
   * Additional allocation metadata as a dictionary
   */
  allocationMetadata?: Record<string, any>;
}

/**
 * Complete experiment allocation information for a user
 */
export interface ExperimentInfo {
  /**
   * @deprecated Use `enrolledTrigger` instead.
   */
  trigger?: string;

  /**
   * Trigger where this user was enrolled
   */
  enrolledTrigger?: string;

  /**
   * All triggers where this experiment is configured
   */
  triggers?: string[];

  /**
   * Experiment name
   */
  experimentName?: string;

  /**
   * Experiment ID
   */
  experimentId?: string;

  /**
   * Experiment type (e.g., "A/B/n test")
   */
  experimentType?: string;

  /**
   * Additional experiment metadata as a dictionary
   */
  experimentMetadata?: Record<string, any>;

  /**
   * When the experiment started (ISO8601 string)
   */
  startDate?: string;

  /**
   * When the experiment ends (ISO8601 string)
   */
  endDate?: string;

  /**
   * Audience ID that user matched
   */
  audienceId?: string;

  /**
   * Audience data as structured object
   * Note: This may be returned as a string from native bridge, but will be parsed
   */
  audienceData?: Record<string, any> | string;

  /**
   * Details about the chosen variant
   */
  chosenVariantDetails?: VariantDetails;

  /**
   * Hash bucketing details
   */
  hashDetails?: HashDetails;
}
