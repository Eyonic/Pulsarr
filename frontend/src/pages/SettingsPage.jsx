import { useEffect, useState } from 'react'

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    deluge_host: '',
    deluge_port: '',
    deluge_url: '',
    deluge_password: '',
    deluge_label: '',
    indexer_url: '',
    indexer_api_key: '',
    abs_base_url: '',
    abs_api_key: ''
  })
  const [settingsStatus, setSettingsStatus] = useState(null)
  const [settingsLoading, setSettingsLoading] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setSettingsLoading(true)
    setSettingsStatus(null)
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      setSettings({
        deluge_host: data.deluge_host || '',
        deluge_port: data.deluge_port || '',
        deluge_url: data.deluge_url || '',
        deluge_password: '',
        deluge_label: data.deluge_label || '',
        indexer_url: data.indexer_url || '',
        indexer_api_key: '',
        abs_base_url: data.abs_base_url || '',
        abs_api_key: ''
      })
    } catch (err) {
      console.error('Failed to load settings', err)
      setSettingsStatus({ type: 'error', message: 'Failed to load settings' })
    } finally {
      setSettingsLoading(false)
    }
  }

  const saveSettings = async () => {
    setSettingsLoading(true)
    setSettingsStatus(null)
    try {
      const payload = { ...settings }
      if (!payload.deluge_password) delete payload.deluge_password
      if (!payload.indexer_api_key) delete payload.indexer_api_key
      if (!payload.abs_api_key) delete payload.abs_api_key

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) {
        setSettingsStatus({ type: 'error', message: data.detail || 'Failed to save settings' })
        return
      }
      setSettingsStatus({ type: 'success', message: 'Settings saved' })
    } catch (err) {
      console.error('Failed to save settings', err)
      setSettingsStatus({ type: 'error', message: 'Failed to save settings' })
    } finally {
      setSettingsLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">Settings</h1>
          <p className="text-slate-500 text-sm">Configure Deluge and Indexer connections</p>
        </div>
        <button
          onClick={loadSettings}
          className="text-sm text-slate-300 hover:text-white bg-slate-800 px-3 py-2 rounded"
          disabled={settingsLoading}
        >
          {settingsLoading ? 'Loading...' : 'Load'}
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Deluge</h2>
            <p className="text-slate-500 text-sm">Host, port, password, and optional URL override</p>
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1">Deluge URL (overrides host/port)</label>
          <input
            type="text"
            value={settings.deluge_url}
            onChange={(e) => setSettings({ ...settings, deluge_url: e.target.value })}
            placeholder="http://127.0.0.1:8112"
            className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Deluge Host</label>
            <input
              type="text"
              value={settings.deluge_host}
              onChange={(e) => setSettings({ ...settings, deluge_host: e.target.value })}
              placeholder="deluge"
              disabled={Boolean(settings.deluge_url)}
              className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Deluge Port</label>
            <input
              type="text"
              value={settings.deluge_port}
              onChange={(e) => setSettings({ ...settings, deluge_port: e.target.value })}
              placeholder="8112"
              disabled={Boolean(settings.deluge_url)}
              className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1">Deluge Password</label>
          <input
            type="password"
            value={settings.deluge_password}
            onChange={(e) => setSettings({ ...settings, deluge_password: e.target.value })}
            placeholder="deluge"
            className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Indexer (Torznab/Prowlarr)</h2>
            <p className="text-slate-500 text-sm">URL and API key for search</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Indexer URL</label>
            <input
              type="text"
              value={settings.indexer_url}
              onChange={(e) => setSettings({ ...settings, indexer_url: e.target.value })}
              placeholder="http://127.0.0.1:9696/torznab/all"
              className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Indexer API Key</label>
            <input
              type="password"
              value={settings.indexer_api_key}
              onChange={(e) => setSettings({ ...settings, indexer_api_key: e.target.value })}
              placeholder="API key"
              className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Default Label (used for torrents)</label>
            <input
              type="text"
              value={settings.deluge_label}
              onChange={(e) => setSettings({ ...settings, deluge_label: e.target.value })}
              placeholder="bookarr"
              className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Audiobookshelf</h2>
            <p className="text-slate-500 text-sm">Configure the base URL and API key used for imports and auto-sync.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Base URL</label>
            <input
              type="text"
              value={settings.abs_base_url}
              onChange={(e) => setSettings({ ...settings, abs_base_url: e.target.value })}
              placeholder="http://127.0.0.1:13378"
              className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Example: http://abs.local:13378</p>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">API Key</label>
            <input
              type="password"
              value={settings.abs_api_key}
              onChange={(e) => setSettings({ ...settings, abs_api_key: e.target.value })}
              placeholder="Audiobookshelf API token"
              className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={saveSettings}
          disabled={settingsLoading}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-60"
        >
          {settingsLoading ? 'Saving...' : 'Save Settings'}
        </button>
        {settingsStatus && (
          <span className={`text-sm ${settingsStatus.type === 'success' ? 'text-green-300' : 'text-red-300'}`}>
            {settingsStatus.message}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">Settings apply immediately and are stored in the database for restarts.</p>
    </div>
  )
}

export default SettingsPage
