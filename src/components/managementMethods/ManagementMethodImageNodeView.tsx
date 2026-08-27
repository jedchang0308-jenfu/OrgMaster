import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { managementMethodApi, ManagementMethodApiError } from '../../managementMethods/apiClient'
import { MANAGEMENT_METHOD_IMAGE_MAX_WIDTH, MANAGEMENT_METHOD_IMAGE_MIN_WIDTH, managementMethodImageWidth, resizedManagementMethodImageWidth } from '../../managementMethods/imageEditing'

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
  const imageCanvasRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number; currentWidth: number; moved: boolean } | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [replacing, setReplacing] = useState(false)
  const [replaceError, setReplaceError] = useState('')
  const [resizingWidth, setResizingWidth] = useState<number | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

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

  useEffect(() => () => resizeCleanupRef.current?.(), [])

  useEffect(() => {
    if (!selected) setMoreOpen(false)
  }, [selected])

  const selectImage = () => {
    const position = getPos()
    if (typeof position === 'number') editor.commands.setNodeSelection(position)
  }
  const currentCanvasWidth = () => resizedManagementMethodImageWidth(imageCanvasRef.current?.getBoundingClientRect().width ?? width ?? MANAGEMENT_METHOD_IMAGE_MIN_WIDTH, 0)
  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeCleanupRef.current?.()
    const startWidth = width ?? currentCanvasWidth()
    resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth, currentWidth: startWidth, moved: false }
    setResizingWidth(startWidth)
    const target = event.currentTarget
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      resizeCleanupRef.current = null
    }
    const move = (moveEvent: PointerEvent) => {
      const state = resizeRef.current
      if (!state || state.pointerId !== moveEvent.pointerId) return
      moveEvent.preventDefault()
      state.currentWidth = resizedManagementMethodImageWidth(state.startWidth, moveEvent.clientX - state.startX)
      state.moved = state.currentWidth !== state.startWidth
      setResizingWidth(state.currentWidth)
    }
    const finish = (finishEvent: PointerEvent) => {
      const state = resizeRef.current
      if (!state || state.pointerId !== finishEvent.pointerId) return
      cleanup()
      resizeRef.current = null
      setResizingWidth(null)
      if (target.hasPointerCapture(finishEvent.pointerId)) target.releasePointerCapture(finishEvent.pointerId)
      if (state.moved && state.currentWidth !== width) updateAttributes({ width: state.currentWidth })
    }
    const cancel = (cancelEvent: PointerEvent) => {
      if (resizeRef.current?.pointerId !== cancelEvent.pointerId) return
      cleanup()
      resizeRef.current = null
      setResizingWidth(null)
      if (target.hasPointerCapture(cancelEvent.pointerId)) target.releasePointerCapture(cancelEvent.pointerId)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    resizeCleanupRef.current = cleanup
    target.setPointerCapture(event.pointerId)
  }
  const resizeWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 100 : 20
    const nextWidth = resizedManagementMethodImageWidth(width ?? currentCanvasWidth(), event.key === 'ArrowRight' ? step : -step)
    updateAttributes({ width: nextWidth })
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
  const displayedWidth = resizingWidth ?? width
  const accessibleWidth = displayedWidth ?? currentCanvasWidth()

  return <NodeViewWrapper as="figure" className={`management-method-editor-image${selected ? ' is-selected' : ''}`}>
    <div className="management-method-editor-image__content" style={displayedWidth ? { width: `${displayedWidth}px` } : undefined}>
      <div ref={imageCanvasRef} className="management-method-editor-image__canvas">
        <button type="button" className="management-method-editor-image__preview" aria-label={`編輯圖片：${altText || '未設定替代文字'}`} onClick={selectImage} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectImage() } }}>
          {displayedSource ? <img src={displayedSource} alt={altText} /> : <span role={failed ? 'alert' : 'status'}>{failed ? '圖片無法載入' : '圖片載入中'}</span>}
        </button>
        {selected ? <>
          <div className="management-method-editor-image__toolbar" role="toolbar" aria-label="圖片操作" onPointerDown={(event) => event.stopPropagation()}>
            {failed && !displayedSource ? <button type="button" onClick={() => setRetryKey((value) => value + 1)}>重試</button> : null}
            <button type="button" disabled={replacing} onClick={() => replacementInputRef.current?.click()}>{replacing ? '替換中…' : '替換'}</button>
            <div className="management-method-editor-image__more" onKeyDown={(event) => { if (event.key === 'Escape') setMoreOpen(false) }}>
              <button type="button" aria-expanded={moreOpen} aria-controls={`management-method-image-more-${mediaId}`} onClick={() => setMoreOpen((value) => !value)}>更多</button>
              {moreOpen ? <div id={`management-method-image-more-${mediaId}`} className="management-method-editor-image__more-menu" aria-label="更多圖片設定" onPointerDown={(event) => event.stopPropagation()}>
                {width || resizingWidth ? <button type="button" onClick={() => { resizeCleanupRef.current?.(); resizeRef.current = null; setResizingWidth(null); updateAttributes({ width: null }) }}>恢復原始尺寸</button> : null}
                <label>替代文字<input value={altText} maxLength={300} onChange={(event) => updateAttributes({ altText: event.target.value })} /></label>
              </div> : null}
            </div>
            <button type="button" className="is-danger" onClick={deleteNode}>刪除</button>
          </div>
          <button type="button" className="management-method-editor-image__resize-handle" role="slider" aria-label="調整圖片寬度" title="拖曳調整大小" aria-valuemin={MANAGEMENT_METHOD_IMAGE_MIN_WIDTH} aria-valuemax={MANAGEMENT_METHOD_IMAGE_MAX_WIDTH} aria-valuenow={accessibleWidth} aria-valuetext={`${accessibleWidth} 像素`} onPointerDown={startResize} onClick={(event) => { event.preventDefault(); event.stopPropagation() }} onKeyDown={resizeWithKeyboard}><span aria-hidden="true" /></button>
          {resizingWidth ? <output className="management-method-editor-image__size" aria-live="polite">{resizingWidth} px</output> : null}
        </> : null}
      </div>
      {selected ? <input className="management-method-editor-image__caption-input" aria-label="圖片說明" placeholder="新增圖片說明（選填）" value={caption} maxLength={300} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => updateAttributes({ caption: event.target.value })} /> : caption ? <figcaption>{caption}</figcaption> : null}
    </div>
    {replaceError ? <span className="management-method-editor-image__error" role="alert">{replaceError}</span> : null}
    <input ref={replacementInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void replaceImage(event.target.files?.[0])} />
  </NodeViewWrapper>
}
