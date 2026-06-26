import { createContext, useContext } from 'react'

const OddsFormatContext = createContext('decimal')

export function OddsFormatProvider({ format = 'decimal', children }) {
    return <OddsFormatContext.Provider value={format}>{children}</OddsFormatContext.Provider>
}

export function useOddsFormat() {
    return useContext(OddsFormatContext)
}

export default OddsFormatContext
