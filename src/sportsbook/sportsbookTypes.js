/**
 * @typedef {'prematch'|'live'|'suspended'|'settled'|'cancelled'} EventStatus
 * @typedef {'available'|'selected'|'suspended'|'odds-up'|'odds-down'|'locked'} SelectionStatus
 * @typedef {'empty'|'selected'|'needs-stake'|'ready'|'odds-changed'|'placing'|'accepted'|'rejected'|'settled'} BetSlipStatus
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
 * @property {string} id
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
 * @property {MarketGroup[]} marketGroups
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
 * @property {string} eventId
 * @property {string} marketId
 * @property {string} acceptedOdds
 * @property {string} currentOdds
 * @property {number} stake
 * @property {SelectionStatus} status
 * @property {boolean} oddsChanged
 *
 * @typedef {Object} Ticket
 * @property {string} id
 * @property {string} mode
 * @property {string} status
 * @property {BetSlipSelection[]} selections
 * @property {number} stake
 * @property {number} totalOdds
 * @property {number} estimatedPayout
 * @property {number} acceptedAt
 * @property {number|null} settledAt
 * @property {string|null} result
 * @property {number} profit
 */

export const SPORTBOOK_TYPE_EXPORT = true
