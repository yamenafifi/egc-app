import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { SecondaryButton, PrimaryButton } from '@/desktop/components/Page'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Shared "Import / Export" control for admin list screens (Expense
// Categories, Users, ...). The caller owns the actual API calls and the
// result shape - this only owns the menu/modal/file-download plumbing.
//
// onExport()          -> Promise<{data: Blob}>            full data dump
// onImportTemplate()  -> Promise<{data: Blob}>             blank headers-only
// onImport(formData)  -> Promise<{data: {created?, updated?, errors: []}}>
export default function ImportExportButton({ entityLabel, filenameBase, onExport, onImportTemplate, onImport, onImported }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const openImport = () => { setMenuOpen(false); setModalOpen(true); setResult(null); setFile(null); setUpdateExisting(false) }

  const doExport = async () => {
    setMenuOpen(false)
    try {
      const { data } = await onExport()
      downloadBlob(data, `${filenameBase}.xlsx`)
      toast.success(`${entityLabel} exported.`)
    } catch { toast.error(`Failed to export ${entityLabel.toLowerCase()}.`) }
  }

  const downloadTemplate = async () => {
    try {
      const { data } = updateExisting ? await onExport() : await onImportTemplate()
      downloadBlob(data, updateExisting ? `${filenameBase}.xlsx` : `${filenameBase}_template.xlsx`)
    } catch { toast.error('Failed to download the template.') }
  }

  const doImport = async () => {
    if (!file) return toast.error('Choose a file to upload.')
    setBusy(true)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('update_existing', updateExisting ? 'true' : 'false')
      const { data } = await onImport(formData)
      setResult(data)
      const parts = []
      if (data.created) parts.push(`${data.created} created`)
      if (data.updated) parts.push(`${data.updated} updated`)
      const summary = parts.length ? parts.join(', ') : 'Nothing changed'
      if (data.errors?.length) toast.error(`${summary}. ${data.errors.length} row(s) had errors - see below.`)
      else { toast.success(`${summary}.`); setModalOpen(false) }
      onImported?.()
    } catch (e) { toast.error(e.response?.data?.error || 'Import failed.') } finally { setBusy(false) }
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white'

  return (
    <>
      <div ref={menuRef} className="relative">
        <SecondaryButton onClick={() => setMenuOpen((o) => !o)} icon={<Icon name="upload" size={13} />}>
          Import / Export
        </SecondaryButton>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-lg shadow-popover z-20 py-1">
            <button onClick={openImport} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
              <Icon name="upload" size={13} className="text-slate-400" /> Import…
            </button>
            <button onClick={doExport} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
              <Icon name="download" size={13} className="text-slate-400" /> Export All
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !busy && setModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full max-w-md shadow-popover flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between gap-3 px-6 pt-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Import {entityLabel}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Download a spreadsheet, edit it, then upload it back.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center shrink-0">
                <Icon name="x" size={16} className="text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto desktop-scrollbar flex-1 flex flex-col gap-4">
              <label className="flex items-start gap-2.5 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-slate-800">Update existing records</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {updateExisting
                      ? 'The template will include every current record so you can edit them in place. Rows left unmatched will error.'
                      : "The template will be blank column headers only, for adding brand-new records. Existing records won't be touched."}
                  </div>
                </div>
              </label>

              <button onClick={downloadTemplate} className="flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Icon name="download" size={14} /> Download {updateExisting ? 'current data' : 'blank template'}
              </button>

              <div>
                <label className="flex flex-col items-center justify-center gap-1 p-5 border border-dashed border-slate-300 rounded-lg bg-slate-50 cursor-pointer text-center hover:bg-slate-100">
                  <Icon name="upload" size={18} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-600">{file ? file.name : 'Click to choose the completed .xlsx'}</span>
                  <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                </label>
              </div>

              {result?.errors?.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto desktop-scrollbar">
                  <div className="text-xs font-bold uppercase tracking-wide text-red-700 mb-1.5">{result.errors.length} row(s) skipped</div>
                  <div className="flex flex-col gap-1">
                    {result.errors.map((e, i) => (
                      <div key={i} className="text-xs text-red-700"><span className="font-semibold">Row {e.row}:</span> {e.error}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <SecondaryButton onClick={() => setModalOpen(false)} disabled={busy}>{result && !result.errors?.length ? 'Close' : 'Cancel'}</SecondaryButton>
              <PrimaryButton onClick={doImport} disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload'}</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
