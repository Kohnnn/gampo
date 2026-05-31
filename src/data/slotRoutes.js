export const SLOT_TEMPLATE_ROUTES = [
    { id: 'vault-rush', path: '/vault-rush' },
    { id: 'river-catcher', path: '/river-catcher' },
    { id: 'dust-rail', path: '/dust-rail' },
    { id: 'storm-banner', path: '/storm-banner' },
    { id: 'bassline-bonus', path: '/bassline-bonus' },
    { id: 'scarab-spin', path: '/scarab-spin' },
    { id: 'bars', path: '/bars' },
    { id: 'blue-samurai', path: '/blue-samurai' },
    { id: 'wanted-revelation', path: '/wanted-revelation' },
    { id: 'gates-ascent', path: '/gates-ascent' },
    { id: 'bass-bayou', path: '/bass-bayou' },
    { id: 'mummy-cascade', path: '/mummy-cascade' },
    { id: 'phoenix-megaways', path: '/phoenix-megaways' },
    { id: 'mansion-megaways', path: '/mansion-megaways' },
    { id: 'ghostblade-strike', path: '/ghostblade-strike' },
    { id: 'iron-fist', path: '/iron-fist' },
    { id: 'coop-cluck', path: '/coop-cluck' },
    { id: 'miko-spirit', path: '/miko-spirit' },
    { id: 'forge-anvil', path: '/forge-anvil' },
    { id: 'gummy-drops', path: '/gummy-drops' },
]

export const SLOT_TEMPLATE_ROUTE_ALIASES = [
    { path: '/scarab', target: '/scarab-spin' },
    { path: '/bass-bayou-collect', target: '/bass-bayou' },
    { path: '/bass-bayou-collection', target: '/bass-bayou' },
    { path: '/ghostblade', target: '/ghostblade-strike' },
    { path: '/miko-spirit-lanterns', target: '/miko-spirit' },
    { path: '/miko-spirit-laterns', target: '/miko-spirit' },
    { path: '/forge-of-the-anvil', target: '/forge-anvil' },
]

const slotRouteMap = new Map(SLOT_TEMPLATE_ROUTES.map(route => [route.id, route.path]))

export function slotPath(templateId) {
    return slotRouteMap.get(templateId) || '/slots'
}
