import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { Color } from '@tiptap/extension-color'
import { FileHandler } from '@tiptap/extension-file-handler'
import { Link } from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import { TextStyle } from '@tiptap/extension-text-style'
import { Underline } from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ManagementMethodImageNodeView } from '../components/managementMethods/ManagementMethodImageNodeView'

interface MethodImageOptions {
  methodId: string
  previewFor: (mediaId: string) => string | null
}

export const MethodImage = Node.create<MethodImageOptions>({
  name: 'methodImage',
  group: 'block',
  atom: true,
  draggable: true,
  addOptions() { return { methodId: '', previewFor: () => null } },
  addAttributes() { return { mediaId: { default: null }, altText: { default: '' }, caption: { default: '' }, width: { default: null } } },
  parseHTML() { return [{ tag: 'figure[data-method-image]' }] },
  renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes(HTMLAttributes, { 'data-method-image': 'true' }), ['img', { alt: HTMLAttributes.altText ?? '' }], ['figcaption', {}, HTMLAttributes.caption ?? '']] },
  addNodeView() { return ReactNodeViewRenderer(ManagementMethodImageNodeView) },
})

export function createManagementMethodExtensions(onFile?: (editor: Editor, files: File[], position: number) => void, imageOptions?: Partial<MethodImageOptions>) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
    Underline,
    TextStyle,
    Color,
    Link.configure({ openOnClick: false, protocols: ['http', 'https', 'mailto'] }),
    TableKit.configure({ table: { resizable: false } }),
    MethodImage.configure({ methodId: imageOptions?.methodId ?? '', previewFor: imageOptions?.previewFor ?? (() => null) }),
    FileHandler.configure({ onPaste: onFile ? (editor, files) => onFile(editor, files, editor.state.selection.from) : undefined, onDrop: onFile ? (editor, files, position) => onFile(editor, files, position) : undefined }),
  ]
}
