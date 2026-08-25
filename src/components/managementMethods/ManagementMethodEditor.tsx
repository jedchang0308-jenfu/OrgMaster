import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { EditorDocumentV1 } from '../../managementMethods/types'
import { createManagementMethodExtensions } from '../../managementMethods/editorExtensions'

export function ManagementMethodEditor({ body, onChange, onFile, disabled }: { body: EditorDocumentV1; onChange: (body: EditorDocumentV1) => void; onFile?: (files: File[]) => void; disabled?: boolean }) {
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  const onFileRef = useRef(onFile); onFileRef.current = onFile
  const editor = useEditor({ extensions: createManagementMethodExtensions((files) => onFileRef.current?.(files)), content: body, editable: !disabled, onUpdate: ({ editor: current }) => onChangeRef.current(current.getJSON() as EditorDocumentV1) })
  useEffect(() => { if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(body)) editor.commands.setContent(body, { emitUpdate: false }) }, [body, editor])
  useEffect(() => { editor?.setEditable(!disabled) }, [disabled, editor])
  return <div className="management-method-editor"><div className="management-method-editor__toolbar" aria-label="文件格式"><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} disabled={!editor}>粗體</button><button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} disabled={!editor}>斜體</button><button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} disabled={!editor}>清單</button><button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} disabled={!editor}>引用</button></div><EditorContent editor={editor} /></div>
}
