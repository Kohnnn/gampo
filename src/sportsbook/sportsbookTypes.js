/**
 * @typedef {'prematch'|'live'|'suspended'|'settled'|'cancelled'} EventStatus
 * @typedef {'available'|'selected'|'suspended'|'odds-up'|'odds-down'|'locked'} SelectionStatus
 * @typedef {'empty'|'selected'|'needs-stake'|'ready'|'odds-changed'|'placing'|'accepted'|'rejected'|'settled'} BetSlipStatus
 * @typedef {'current'|'stale'|'unknown'} OfferFreshness
 * @typedef {'current'|'stale'|'empty'|'partial'|'error'} FeedStatus
 * @typedef {'odds'|'score-status'|'schedule-metadata'|'model'} FactRole
 *
 * @typedef {Object} Sport
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {number} liveCount
 * @property {number} sortOrder
 * @property {string[]} groups
 *
 * @typedef {Object} League
 * @property {string} id
 * @property {string} sportId
 * @property {string} region
 * @property {string} country
 * @property {string} label
 * @property {number} liveCount
 * @property {number} eventCount
 *
 * @typedef {Object} Event
 * @property {string} id Canonical event identity.
 * @property {string} canonicalEventId Equal to the canonical `id`.
 * @property {string} sportId
 * @property {string} leagueId
 * @property {string} region
 * @property {string} startsAt
 * @property {EventStatus} status
 * @property {string} clock
 * @property {string} period
 * @property {string} home
 * @property {string} away
 * @property {string[]} participants
 * @property {{home:number,away:number}|null} score
 * @property {Object} liveStats
 * @property {number} popularity
 * @property {string[]} tags
 * @property {string} canonicalKey
 * @property {{provider:string,eventId:string}[]} sourceRefs
 * @property {{scheduleMetadata:FactObservation,scoreStatus:FactObservation,scheduleMetadataObservations:FactObservation[],scoreStatusObservations:FactObservation[]}} facts
 * @property {Offer[]} offers
 * @property {ModelEstimate[]} modelEstimates
 * @property {{status:FeedStatus}} feedState
 * @property {MarketGroup[]} marketGroups
 *
 * @typedef {Object} FactObservation
 * @property {FactRole} role
 * @property {string} provider
 * @property {string|null} observedAt
 *
 * @typedef {Object} Offer
 * @property {string} id
 * @property {string} canonicalEventId
 * @property {string} provider
 * @property {string} providerEventId
 * @property {string} bookmaker
 * @property {string} marketId
 * @property {string} outcome
 * @property {number} decimalOdds
 * @property {string|null} observedAt
 * @property {OfferFreshness} freshness
 * @property {boolean} submittable
 * @property {string|null} ineligibilityReason
 * @property {Object} sourceContext
 *
 * @typedef {Offer} ModelEstimate
 *
 * @typedef {Object} MarketGroup
 * @property {string} id
 * @property {string} label
 * @property {'grid'|'rows'|'compact'} displayMode
 * @property {boolean} collapsed
 * @property {Selection[]} selections
 *
 * @typedef {Object} Selection
 * @property {string} id
 * @property {string} eventId
 * @property {string} marketId
 * @property {string} label
 * @property {string} side
 * @property {number} decimalOdds
 * @property {number} previousOdds
 * @property {boolean} suspended
 * @property {boolean} boosted
 * @property {number} trueProbability
 * @property {string} source
 * @property {SelectionStatus} status
 *
 * @typedef {Object} BetSlipSelection
 * @property {string} selectionId
 * @property {string} canonicalEventId
 * @property {string} eventId
 * @property {string} marketId
 * @property {string} acceptedOdds
 * @property {string} currentOdds
 * @property {number} stake
 * @property {SelectionStatus} status
 * @property {boolean} oddsChanged
 *
 * @typedef {Object} TicketCombination
 * @property {string} id
 * @property {string} mode
 * @property {string[]} selectionIds
 * @property {number} stake
 * @property {number} rawStake
 * @property {number} [oddsProduct]
 * @property {number} [rawOddsProduct]
 * @property {number} [estimatedReturn]
 * @property {number} [rawEstimatedReturn]
 * @property {number} [settledReturn]
 * @property {number} [rawSettledReturn]
 *
 * @typedef {Object} Ticket
 * @property {string} id
 * @property {string} mode
 * @property {string} status
 * @property {BetSlipSelection[]} selections
 * @property {number} stake
 * @property {number} totalOdds
 * @property {number} estimatedPayout
 * @property {number} combinations
 * @property {TicketCombination[]} combinationDetails
 * @property {number} acceptedAt
 * @property {number|null} settledAt
 * @property {string|null} result
 * @property {number} profit
 */

export const SPORTBOOK_TYPE_EXPORT = true
