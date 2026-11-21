import Asset from '../primitives/Asset'
import { resolveImage } from '../../../utils/assetPaths'

// Source width/height and measured alpha bounds. These files retain tall transparent strips.
// Gummy K excludes the separate neighboring glyph at x348..380.
const RANK_CROPS = {
    'slot-rank-bass-bayou-J.webp': [380, 1900, 112, 684, 331, 1215],
    'slot-rank-bass-bayou-Q.webp': [380, 1900, 80, 685, 295, 1215],
    'slot-rank-river-catcher-J.webp': [380, 1900, 125, 715, 290, 1185],
    'slot-rank-river-catcher-K.webp': [380, 1900, 23, 716, 254, 1185],
    'slot-rank-river-catcher-Q.webp': [380, 1900, 59, 716, 273, 1185],
    'slot-rank-bars-Q.webp': [380, 1900, 69, 800, 308, 1116],
    'slot-rank-coop-cluck-Q.webp': [380, 1900, 57, 692, 329, 1200],
    'slot-rank-blue-samurai-A.webp': [355, 1779, 44, 624, 193, 1155],
    'slot-rank-blue-samurai-J.webp': [355, 1779, 138, 633, 289, 1153],
    'slot-rank-blue-samurai-K.webp': [355, 1779, 82, 636, 228, 1155],
    'slot-rank-blue-samurai-Q.webp': [355, 1779, 112, 636, 263, 1157],
    'slot-rank-forge-anvil-K.webp': [380, 1900, 45, 788, 249, 1102],
    'slot-rank-forge-anvil-Q.webp': [380, 1900, 92, 835, 308, 1103],
    'slot-rank-gummy-drops-K.webp': [380, 1900, 50, 804, 265, 1095],
    'slot-rank-gummy-drops-Q.webp': [380, 1900, 80, 800, 347, 1102],
    'slot-rank-mummy-cascade-J.webp': [380, 1900, 101, 725, 344, 1173],
    'slot-rank-mummy-cascade-K.webp': [380, 1900, 40, 729, 276, 1171],
    'slot-rank-mummy-cascade-Q.webp': [380, 1900, 68, 728, 308, 1173],
    'slot-rank-scarab-spin-Q.webp': [380, 1900, 82, 764, 313, 1137],
    'slot-rank-storm-banner-A.webp': [380, 1900, 26, 746, 271, 1155],
    'slot-rank-storm-banner-J.webp': [380, 1900, 92, 745, 332, 1155],
    'slot-rank-storm-banner-K.webp': [380, 1900, 42, 746, 287, 1155],
    'slot-rank-storm-banner-Q.webp': [380, 1900, 55, 746, 303, 1155],
    'slot-rank-gates-ascent-Q.webp': [380, 1900, 50, 765, 326, 1134],
    'slot-rank-bassline-bonus-Q.webp': [380, 1900, 62, 618, 300, 1281],
    'slot-rank-ghostblade-strike-Q.webp': [380, 1900, 47, 787, 327, 1117],
    'slot-rank-miko-spirit-Q.webp': [369, 1848, 84, 681, 311, 1163],
    'slot-rank-vault-rush-Q.webp': [380, 1900, 37, 758, 340, 1143],
    'slot-rank-wanted-revelation-Q.webp': [380, 1900, 41, 701, 324, 1200],
    'slot-rank-dust-rail-Q.webp': [380, 1900, 45, 752, 335, 1150],
}

export default function SlotSymbol({ symbol }) {
    if (symbol?.barCount) {
        return (
            <span className="slot-bar-token" role="img" aria-label={`${symbol.barCount} BAR${symbol.barCount === 1 ? '' : 'S'}`}>
                {Array.from({ length: symbol.barCount }, (_, index) => <span key={index}>BAR</span>)}
            </span>
        )
    }
    const crop = RANK_CROPS[resolveImage(symbol?.asset)?.split('/').pop()]
    const image = <Asset src={symbol?.asset} alt={symbol?.label} fallback={<strong>{symbol?.label}</strong>} />
    let artwork = image
    if (crop) {
        const [width, height, left, top, right, bottom] = crop
        const cropWidth = right - left, cropHeight = bottom - top
        artwork = (
            <span className="slot-rank-crop" style={{
                '--slot-crop-ratio': cropWidth / cropHeight,
                '--slot-crop-width': `${width / cropWidth * 100}%`,
                '--slot-crop-height': `${height / cropHeight * 100}%`,
                '--slot-crop-left': `${-left / cropWidth * 100}%`,
                '--slot-crop-top': `${-top / cropHeight * 100}%`,
            }}>{image}</span>
        )
    }
    return (
        <>
            {artwork}
            {symbol?.tokenLabel && <span className="slot-symbol-token">{symbol.tokenLabel}</span>}
        </>
    )
}
