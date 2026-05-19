import { useState } from 'react'
import EducationPanel from './EducationPanel'
import { useCredits } from '../context/CreditContext'
import { findGameDefinition } from '../data/gameDefinitions'

function CoreGameEducationDock({ gameId, defaultBet = 5, winProbability, payoutMultiplier }) {
    const [open, setOpen] = useState(false)
    const { balance } = useCredits()
    const definition = findGameDefinition(gameId)

    return (
        <div className={`core-education-dock ${open ? 'open' : ''}`}>
            <button className="core-education-toggle" onClick={() => setOpen(value => !value)}>
                {open ? 'Close Lab' : 'Open Lab'}
            </button>
            <div className="core-education-sheet">
                <EducationPanel
                    definition={definition}
                    betAmount={defaultBet}
                    winProbability={winProbability}
                    payoutMultiplier={payoutMultiplier}
                    balance={balance}
                />
            </div>
        </div>
    )
}

export default CoreGameEducationDock
