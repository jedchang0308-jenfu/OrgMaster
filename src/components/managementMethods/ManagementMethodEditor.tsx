import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import type { EditorDocumentV1 } from '../../managementMethods/types'
import { managementMethodImageNode, type UploadedManagementMethodImage } from '../../managementMethods/imageEditing'
import { createManagementMethodExtensions } from '../../managementMethods/editorExtensions'

export function ManagementMethodEditor({ methodId, body, onChange, onFile, disabled }: { methodId: string; body: EditorDocumentV1; onChange: (body: EditorDocumentV1) => void; onFile?: (files: File[]) => Promise<UploadedManagementMethodImage[]>; disabled?: boolean }) {
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  const onFileRef = useRef(onFile); onFileRef.current = onFile
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewsRef = useRef(new Map<string, string>())
  const [uploading, setUploading] = useState(false)
  const uploadAndInsert = useCallback(async (current: Editor, files: File[], position: number) => {
    if (!onFileRef.current || !files.length) return
    setUploading(true)
    try {
      const uploaded = await onFileRef.current(files)
      if (!uploaded.length || current.isDestroyed) return
      uploaded.forEach((image) => previewsRef.current.set(image.mediaId, URL.createObjectURL(image.file)))
      current.chain().focus().insertContentAt(position, uploaded.map(managementMethodImageNode)).run()
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [])
  const editor = useEditor({ extensions: createManagementMethodExtensions((current, files, position) => { void uploadAndInsert(current, files, position) }, { methodId, previewFor: (mediaId) => previewsRef.current.get(mediaId) ?? null }), content: body, editable: !disabled, onUpdate: ({ editor: current }) => onChangeRef.current(current.getJSON() as EditorDocumentV1) }, [methodId])
  useEffect(() => { if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(body)) editor.commands.setContent(body, { emitUpdate: false }) }, [body, editor])
  useEffect(() => { editor?.setEditable(!disabled) }, [disabled, editor])
  useEffect(() => () => { previewsRef.current.forEach((source) => URL.revokeObjectURL(source)); previewsRef.current.clear() }, [])
  return <div className="management-method-editor"><div className="management-method-editor__toolbar" aria-label="文件格式"><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} disabled={!editor}>粗體</button><button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} disabled={!editor}>斜體</button><button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} disabled={!editor}>清單</button><button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} disabled={!editor}>引用</button><button type="button" disabled={!editor || uploading || disabled} onClick={() => fileInputRef.current?.click()}>{uploading ? '圖片上傳中…' : '加入圖片'}</button><input ref={fileInputRef} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => { if (editor && event.target.files?.length) void uploadAndInsert(editor, [...event.target.files], editor.state.selection.from) }} /></div><EditorContent editor={editor} /></div>
}
