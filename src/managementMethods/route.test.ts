import { describe, expect, it } from 'vitest'
import { buildManagementMethodDocumentUrl, readManagementMethodLocation } from './route'

describe('management method routes', () => {
  it('round trips readable deep links and chapter anchors', () => {
    const url = buildManagementMethodDocumentUrl('method/1', 'readable', '章節 一')
    const location = new URL(url, 'http://orgmaster.local')
    expect(readManagementMethodLocation(location as unknown as Location)).toMatchObject({ isDocumentPage: true, methodId: 'method/1', view: 'readable', chapter: '章節 一' })
  })
})
