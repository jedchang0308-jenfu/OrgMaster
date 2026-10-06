import {describe,expect,it} from 'vitest'
import {SourceMapConsumer} from 'source-map-js'

// Exercise the actual patched parser. Rejected inputs are checked at construction,
// before an attacker-controlled offset could expand a generated map.
const basic={version:3,sources:['fixture.js'],names:[],mappings:'AAAA',sourcesContent:['fixture']}
const indexed=(line,map=basic)=>({version:3,sections:[{offset:{line,column:0},map}]})
describe('DEV-014 release source-map availability boundary',()=>{
  it('keeps ordinary indexed maps usable',()=>{
    const consumer=new SourceMapConsumer(indexed(3))
    const mappings=[]
    consumer.eachMapping(value=>mappings.push(value))
    expect(consumer.sourceContentFor('fixture.js')).toBe('fixture')
    expect(mappings).toHaveLength(1)
    expect(mappings[0]).toMatchObject({source:'fixture.js',generatedLine:4,originalLine:1})
  })
  for(const line of [Number.MAX_SAFE_INTEGER,-1,1.5]){
    it('rejects invalid indexed line offset '+line,()=>{
      expect(()=>new SourceMapConsumer(indexed(line))).toThrow()
    })
  }
  it('rejects nested offsets whose combined line count is excessive',()=>{
    expect(()=>new SourceMapConsumer(indexed(6_000_000,indexed(6_000_000)))).toThrow()
  })
})
