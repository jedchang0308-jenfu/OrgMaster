import type { EditorNodeV1 } from './types'

export interface UploadedManagementMethodImage {
  mediaId: string
  altText: string
  file: File
}

export function managementMethodImageWidth(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 160 && Number(value) <= 1200 ? Number(value) : null
}

export function managementMethodImageNode(image: Pick<UploadedManagementMethodImage, 'mediaId' | 'altText'>): EditorNodeV1 {
  return {
    type: 'methodImage',
    attrs: {
      mediaId: image.mediaId,
      altText: image.altText,
      caption: '',
      width: null,
    },
  }
}
