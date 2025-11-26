import { useEffect, useState } from 'react'
import { FolderOpen, Library, Radio, RefreshCw } from 'lucide-react'

const ImportPage = () => {
  const [importPath, setImportPath] = useState('')
  const [importDryRun, setImportDryRun] = useState(true)
  const [importStatus, setImportStatus] = useState(null)
  const [importLoading, setImportLoading] = useState(false)

  const [absDryRun, setAbsDryRun] = useState(true)
  const [absImportLoading, setAbsImportLoading] = useState(false)
  const [absImportStatus, setAbsImportStatus] = useState(null)

  const [autosyncStatus, setAutosyncStatus] = useState({
    enabled: false,
    interval_hours: 6,
    last_run: null,
    last_result: null
  })
  const [autosyncConfigSaving, setAutosyncConfigSaving] = useState(false)
  const [autosyncMessage, setAutosyncMessage] = useState(null)
  const [syncNowLoading, setSyncNowLoading] = useState(false)

  const [magnetUrl, setMagnetUrl] = useState('')
  const [torrentStatus, setTorrentStatus] = useState(null)
  const [torrentLoading, setTorrentLoading] = useState(false)
  const [magnetLabel, setMagnetLabel] = useState('')
  const [settings, setSettings] = useState({ deluge_label: '' })

  useEffect(() => {
    fetchAutosyncStatus()
    fetchSettingsDefaults()
  }, [])

  const handleImport = async (e) => {
    e.preventDefault()
    setImportLoading(true)
    setImportStatus(null)
    try {
      const res = await fetch('/api/library/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath || null, dry_run: importDryRun })
      })
      const data = await res.json()
      if (!res.ok) {
        setImportStatus({ type: 'error', message: data.detail || 'Import failed' })
        return
      }
      setImportStatus({
        type: 'success',
        message: `Queued import${importPath ? ` for ${importPath}` : ''}`
      })
    } catch (err) {
      console.error('Import request failed', err)
      setImportStatus({ type: 'error', message: 'Failed to submit import' })
    } finally {
      setImportLoading(false)
    }
  }

  const handleTorrentImport = async (e) => {
    e.preventDefault()
    if (!magnetUrl) {
      setTorrentStatus({ type: 'error', message: 'Please paste a magnet link' })
      return
    }
    setTorrentLoading(true)
    setTorrentStatus(null)
    try {
      const res = await fetch('/api/downloads/deluge/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet_url: magnetUrl, label: magnetLabel || settings.deluge_label })
      })
      const data = await res.json()
      if (!res.ok) {
        setTorrentStatus({ type: 'error', message: data.detail || 'Failed to add torrent' })
        return
      }
      setTorrentStatus({ type: 'success', message: 'Sent to Deluge' })
      setMagnetUrl('')
    } catch (err) {
      console.error('Torrent import failed', err)
      setTorrentStatus({ type: 'error', message: 'Failed to add torrent' })
    } finally {
      setTorrentLoading(false)
    }
  }

  const fetchSettingsDefaults = async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = await res.json()
      setSettings({ deluge_label: data.deluge_label || '' })
      if (!magnetLabel) {
        setMagnetLabel(data.deluge_label || '')
      }
    } catch (err) {
      console.error('Failed to load settings for imports', err)
    }
  }

  const fetchAutosyncStatus = async () => {
    try {
      const res = await fetch('/api/autosync/status')
      if (!res.ok) return
      const data = await res.json()
      setAutosyncStatus({
        enabled: !!data.enabled,
        interval_hours: data.interval_hours ?? 6,
        last_run: data.last_run || null,
        last_result: data.last_result || null
      })
    } catch (err) {
      console.error('Failed to fetch autosync status', err)
    }
  }

  const handleAutosyncSave = async () => {
    setAutosyncConfigSaving(true)
    setAutosyncMessage(null)
    try {
      const res = await fetch('/api/autosync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: autosyncStatus.enabled,
          interval_hours: autosyncStatus.interval_hours
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setAutosyncMessage({ type: 'error', message: data.detail || 'Failed to save auto-sync config' })
        return
      }
      setAutosyncStatus({
        enabled: !!data.enabled,
        interval_hours: data.interval_hours ?? autosyncStatus.interval_hours,
        last_run: data.last_run || null,
        last_result: data.last_result || null
      })
      setAutosyncMessage({ type: 'success', message: 'Auto-sync settings saved' })
    } catch (err) {
      console.error('Failed to save autosync config', err)
      setAutosyncMessage({ type: 'error', message: 'Failed to save auto-sync config' })
    } finally {
      setAutosyncConfigSaving(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncNowLoading(true)
    setAutosyncMessage(null)
    try {
      const res = await fetch('/api/autosync/sync-now', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setAutosyncMessage({ type: 'error', message: data.detail || 'Sync failed' })
        return
      }
      setAutosyncStatus((prev) => ({
        ...prev,
        last_run: new Date().toISOString(),
        last_result: data
      }))
      setAutosyncMessage({ type: 'success', message: 'Sync completed' })
    } catch (err) {
      console.error('Sync now failed', err)
      setAutosyncMessage({ type: 'error', message: 'Sync failed' })
    } finally {
      setSyncNowLoading(false)
    }
  }

  const handleAbsImport = async () => {
    setAbsImportLoading(true)
    setAbsImportStatus(null)
    try {
      const params = new URLSearchParams({ dry_run: String(absDryRun) })
      const res = await fetch(`/api/library/import/bookshelf?${params.toString()}`, {
        method: 'POST'
      })
      const data = await res.json()
      if (!res.ok) {
        setAbsImportStatus({ type: 'error', message: data.detail || 'ABS import failed' })
        return
      }
      const importedCount =
        data.imported ?? data.total_items ?? (Array.isArray(data.items) ? data.items.length : 0) ?? 0

      setAbsImportStatus({
        type: 'success',
        message: absDryRun
          ? `Dry run: would import ${importedCount} audiobooks`
          : `Imported ${importedCount} audiobooks`
      })
    } catch (err) {
      console.error('ABS import failed', err)
      setAbsImportStatus({ type: 'error', message: 'Audiobookshelf import failed' })
    } finally {
      setAbsImportLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold text-blue-400">Library Import</h1>
        <span className="text-slate-500 text-sm">Sync Audiobookshelf and legacy imports</span>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio size={18} className="text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Audiobookshelf Auto-Sync</h2>
              <p className="text-slate-500 text-sm">Periodically sync your Audiobookshelf library into BookArr</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={autosyncStatus.enabled}
              onChange={(e) =>
                setAutosyncStatus((prev) => ({
                  ...prev,
                  enabled: e.target.checked
                }))
              }
              className="accent-blue-500"
            />
            Enable auto-sync
          </label>

          <div className="flex items-center gap-2 text-sm text-slate-200">
            <span>Every</span>
            <select
              value={autosyncStatus.interval_hours}
              onChange={(e) =>
                setAutosyncStatus((prev) => ({
                  ...prev,
                  interval_hours: Number(e.target.value)
                }))
              }
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
            >
              <option value={1}>1 hour</option>
              <option value={3}>3 hours</option>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleAutosyncSave}
            disabled={autosyncConfigSaving}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {autosyncConfigSaving ? 'Saving...' : 'Save Auto-Sync'}
          </button>

          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncNowLoading}
            className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-white text-sm flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw size={16} className={syncNowLoading ? 'animate-spin' : ''} />
            {syncNowLoading ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        <div className="text-xs text-slate-500 space-y-1">
          <div>
            Last run:{' '}
            {autosyncStatus.last_run ? new Date(autosyncStatus.last_run).toLocaleString() : 'never'}
          </div>
          {autosyncStatus.last_result && autosyncStatus.last_result.imported_count != null && (
            <div>Last result: imported {autosyncStatus.last_result.imported_count} items</div>
          )}
          {autosyncStatus.last_result && autosyncStatus.last_result.error && (
            <div className="text-red-300">Last error: {autosyncStatus.last_result.error}</div>
          )}
        </div>

        {autosyncMessage && (
          <div className={`text-sm ${autosyncMessage.type === 'success' ? 'text-green-300' : 'text-red-300'}`}>
            {autosyncMessage.message}
          </div>
        )}
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Library size={18} className="text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold text-slate-100">One-off Import from Audiobookshelf</h2>
            <p className="text-slate-500 text-sm">Run an immediate sync, with optional dry run</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={absDryRun}
            onChange={(e) => setAbsDryRun(e.target.checked)}
            className="accent-blue-500"
          />
          Dry run (don&apos;t change the database, just show what would be imported)
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAbsImport}
            disabled={absImportLoading}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-60"
          >
            <Library size={18} />
            {absImportLoading ? 'Importing...' : 'Import from Audiobookshelf'}
          </button>
          {absImportStatus && (
            <span
              className={`text-sm ${
                absImportStatus.type === 'success' ? 'text-green-300' : 'text-red-300'
              }`}
            >
              {absImportStatus.message}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleImport} className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-sm text-slate-300 mb-1">Library path (optional)</label>
          <input
            type="text"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            placeholder="/books/Library/Authors"
            className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Leave empty to use the configured library path when import is implemented.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={importDryRun}
            onChange={(e) => setImportDryRun(e.target.checked)}
            className="accent-blue-500"
          />
          Dry run (list actions without moving files)
        </label>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={importLoading}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-60"
          >
            <FolderOpen size={18} />
            {importLoading ? 'Submitting...' : 'Start Import'}
          </button>
          {importStatus && (
            <span
              className={`text-sm ${
                importStatus.type === 'success' ? 'text-green-300' : 'text-red-300'
              }`}
            >
              {importStatus.message}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          Note: Backend import pipeline is not implemented yet (only Audiobookshelf import is active).
        </div>
      </form>

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Radio size={18} className="text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Import Torrent (Deluge)</h2>
            <p className="text-slate-500 text-sm">Send a magnet link to Deluge on port 8112</p>
          </div>
        </div>
        <form onSubmit={handleTorrentImport} className="space-y-3">
          <input
            type="text"
            value={magnetUrl}
            onChange={(e) => setMagnetUrl(e.target.value)}
            placeholder="Paste magnet link..."
            className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={magnetLabel}
            onChange={(e) => setMagnetLabel(e.target.value)}
            placeholder={`Label (default: ${settings.deluge_label || 'bookarr'})`}
            className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={torrentLoading}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-60"
            >
              <Radio size={18} />
              {torrentLoading ? 'Sending...' : 'Send to Deluge'}
            </button>
            {torrentStatus && (
              <span
                className={`text-sm ${
                  torrentStatus.type === 'success' ? 'text-green-300' : 'text-red-300'
                }`}
              >
                {torrentStatus.message}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Ensure Deluge WebUI is reachable at host "deluge" port 8112 (configurable via backend env).
          </p>
        </form>
      </div>
    </div>
  )
}

export default ImportPage
