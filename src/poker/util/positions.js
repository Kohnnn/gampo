// Map a seat index to its 6-max position role given the button index.
// Roles (clockwise from BTN): BTN, SB, BB, UTG, MP, CO. Heads-up shrinks to BTN/BB.

const ROLES_6 = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO']
const ROLES_HU = ['BTN', 'BB']

export function rolesForSeats(seatCount, buttonIndex) {
    const roles = seatCount === 2 ? ROLES_HU : ROLES_6
    const out = new Array(seatCount)
    for (let i = 0; i < seatCount; i++) {
        const offset = (i - buttonIndex + seatCount) % seatCount
        out[i] = roles[offset] || `S${offset}`
    }
    return out
}

export function roleFor(seatIndex, buttonIndex, seatCount = 6) {
    return rolesForSeats(seatCount, buttonIndex)[seatIndex]
}
