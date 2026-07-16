import { describe, expect, it } from 'vitest'
import { extractPlinkoOutcomesJson } from '../../scripts/plinkoOutcomesStaticPlugin'

describe('extractPlinkoOutcomesJson', () => {
    it('preserves the exact generated lookup values while removing the module wrapper', () => {
        const source = '// AUTO-SPLIT\nexport default {"0":[123,456],"1":[789]};\n'

        const json = extractPlinkoOutcomesJson(source)

        expect(json).toBe('{"0":[123,456],"1":[789]}')
        expect(JSON.parse(json)).toEqual({ 0: [123, 456], 1: [789] })
    })

    it('fails closed for unexpected generated-module shapes', () => {
        expect(() => extractPlinkoOutcomesJson('export const outcomes = {}', 'rows-8.js'))
            .toThrow('Missing default export in rows-8.js')
        expect(() => extractPlinkoOutcomesJson('export default not-json', 'rows-8.js'))
            .toThrow()
    })
})
