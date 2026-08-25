import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { managementMethodApi, ManagementMethodApiError } from '../../managementMethods/apiClient'
import { managementMethodImageWidth } from '../../managementMethods/imageEditing'

interface MethodImageNodeOptions {
  methodId: string
  previewFor: (mediaId: string) => string | null
}

export function ManagementMethodImageNodeView({ node, editor, extension, getPos, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const options = extension.options as MethodImageNodeOptions
  const mediaId = String(node.attrs.mediaId ?? '')
  const altText = String(node.attrs.altText ?? '')
  const caption = String(node.attrs.caption ?? '')
  const width = managementMethodImageWidth(node.attrs.width)
  const insertedPreview = options.previewFor(mediaId)
  const replacementInputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [replacing, setReplacing] = useState(false)
  const [replaceError, setReplaceError] = useState('')

  useEffect(() => {
    if (insertedPreview || localPreview || !options.methodId || !mediaId) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    setSource(null)
    setFailed(false)
    void managementMethodApi.media(options.methodId, mediaId, 'draft', controller.signal).then((blob) => {
      objectUrl = URL.createObjectURL(blob)
      setSource(objectUrl)
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [insertedPreview, localPreview, mediaId, options.methodId, retryKey])

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview)
  }, [localPreview])

  const selectImage = () => {
    const position = getPos()
    if (typeof position === 'number') editor.commands.setNodeSelection(position)
  }
  const replaceImage = async (file: File | undefined) => {
    if (!file || !options.methodId) return
    setReplacing(true)
    setReplaceError('')
    try {
      const result = await managementMethodApi.uploadMedia(options.methodId, file, altText.trim() || file.name)
      const nextPreview = URL.createObjectURL(file)
      setLocalPreview(nextPreview)
      updateAttributes({ mediaId: result.media.id, altText: altText.trim() || result.media.altText || file.name })
    } catch (reason) {
      setReplaceError(reason instanceof ManagementMethodApiError ? `圖片未替換：${reason.failure.code}` : '圖片未替換')
    } finally {
      setReplacing(false)
      if (replacementInputRef.current) replacementInputRef.current.value = ''
    }
  }
  const displayedSource = localPreview ?? insertedPreview ?? source

  return <NodeViewWrapper as="figure" className={`management-method-editor-image${selected ? ' is-selected' : ''}`}>
    <button type="button" className="management-method-editor-image__preview" aria-label={`編輯圖片：${altText || '未設定替代文字'}`} onClick={selectImage} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectImage() } }} style={width ? { width: `${width}px` } : undefined}>
      {displayedSource ? <img src={displayedSource} alt={altText} /> : <span role={failed ? 'alert' : 'status'}>{failed ? '圖片無法載入' : '圖片載入中'}</span>}
    </button>
    {!selected && caption ? <figcaption>{caption}</figcaption> : null}
    {selected ? <div className="management-method-editor-image__controls" aria-label="圖片設定" onPointerDown={(event) => event.stopPropagation()}>
      <label>替代文字<input value={altText} maxLength={300} onChange={(event) => updateAttributes({ altText: event.target.value })} /></label>
      <label>圖片說明<input value={caption} maxLength={300} onChange={(event) => updateAttributes({ caption: event.target.value })} /></label>
      <label>寬度<select value={width ?? ''} onChange={(event) => updateAttributes({ width: event.target.value ? Number(event.target.value) : null })}><option value="">原始寬度</option><option value="320">小</option><option value="640">中</option><option value="900">大</option><option value="1200">最大</option></select></label>
      <div className="management-method-editor-image__actions">
        {failed && !displayedSource ? <button type="button" onClick={() => setRetryKey((value) => value + 1)}>重試載入</button> : null}
        <button type="button" disabled={replacing} onClick={() => replacementInputRef.current?.click()}>{replacing ? '替換中…' : '替換圖片'}</button>
        <button type="button" className="is-danger" onClick={deleteNode}>刪除</button>
        <input ref={replacementInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void replaceImage(event.target.files?.[0])} />
      </div>
      {replaceError ? <span className="management-method-editor-image__error" role="alert">{replaceError}</span> : null}
    </div> : null}
  </NodeViewWrapper>
}
