import { Node, mergeAttributes } from '@tiptap/core'
import { Color } from '@tiptap/extension-color'
import { FileHandler } from '@tiptap/extension-file-handler'
import { Link } from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import { TextStyle } from '@tiptap/extension-text-style'
import { Underline } from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'

export const MethodImage = Node.create({
  name: 'methodImage',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() { return { mediaId: { default: null }, altText: { default: '' }, caption: { default: '' }, width: { default: null } } },
  parseHTML() { return [{ tag: 'figure[data-method-image]' }] },
  renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes(HTMLAttributes, { 'data-method-image': 'true' }), ['img', { alt: HTMLAttributes.altText ?? '' }], ['figcaption', {}, HTMLAttributes.caption ?? '']] },
})

export function createManagementMethodExtensions(onFile?: (files: File[]) => void) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
    Underline,
    TextStyle,
    Color,
    Link.configure({ openOnClick: false, protocols: ['http', 'https', 'mailto'] }),
    TableKit.configure({ table: { resizable: false } }),
    MethodImage,
    FileHandler.configure({ onPaste: onFile ? (_editor, files) => onFile(files) : undefined, onDrop: onFile ? (_editor, files) => onFile(files) : undefined }),
  ]
}
