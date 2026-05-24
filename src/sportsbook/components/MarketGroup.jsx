import { ChevronDown } from 'lucide-react'
import { analyzeMarketGroup } from '../sportsbookEducation'
import OddsButton from './OddsButton'
import OddsCoach from './OddsCoach'

function MarketGroup({ group, selectedIds, onToggleSelection, compact }) {
    const analysis = analyzeMarketGroup(group)

    return (
        <details className="sb-market-group" open={!group.collapsed}>
            <summary>
                <span>{group.label}</span>
                <ChevronDown size={16} />
            </summary>
            <div className="sb-market-coach-row">
                <OddsCoach analysis={analysis} variant="chip" label="Analyze market" />
            </div>
            <div className={`sb-market-selections ${group.displayMode === 'grid' ? 'is-grid' : ''} ${compact ? 'is-compact' : ''}`}>
                {group.selections.map(selection => (
                    <OddsButton
                        key={selection.id}
                        selection={selection}
                        selected={selectedIds.has(selection.id)}
                        onToggle={() => onToggleSelection(selection.id)}
                        marketGroup={group}
                    />
                ))}
            </div>
        </details>
    )
}

export default MarketGroup
