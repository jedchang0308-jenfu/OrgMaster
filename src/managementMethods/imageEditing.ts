import type { EditorNodeV1 } from './types'

export interface UploadedManagementMethodImage {
  mediaId: string
  altText: string
  file: File
}

export const MANAGEMENT_METHOD_IMAGE_MIN_WIDTH = 160
export const MANAGEMENT_METHOD_IMAGE_MAX_WIDTH = 1200

export function managementMethodImageWidth(value: unknown) {
  return Number.isInteger(value) && Number(value) >= MANAGEMENT_METHOD_IMAGE_MIN_WIDTH && Number(value) <= MANAGEMENT_METHOD_IMAGE_MAX_WIDTH ? Number(value) : null
}

export function resizedManagementMethodImageWidth(startWidth: number, horizontalDelta: number) {
  const candidate = Math.round(startWidth + horizontalDelta)
  return Math.max(MANAGEMENT_METHOD_IMAGE_MIN_WIDTH, Math.min(MANAGEMENT_METHOD_IMAGE_MAX_WIDTH, candidate))
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
