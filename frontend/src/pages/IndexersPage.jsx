import { useEffect, useState } from 'react'
import { RefreshCw, Server } from 'lucide-react'

const IndexersPage = () => {
  const [indexers, setIndexers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchIndexers()
  }, [])

  const fetchIndexers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/indexers')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Failed to load indexers (${res.status})`)
      }
      const data = await res.json()
      setIndexers(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load indexers', err)
      setError('Failed to load indexers. Check Prowlarr settings.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="text-blue-400" size={20} />
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Indexers</h1>
            <p className="text-slate-500 text-sm">Fetched from your Prowlarr/Torznab configuration.</p>
          </div>
        </div>
        <button
          onClick={fetchIndexers}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 px-3 py-2 rounded"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="text-sm text-red-300">{error}</div>}

      {indexers.length === 0 && !loading && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 text-slate-400">
          No indexers found. Check settings and try again.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {indexers.map((idx) => (
          <div
            key={idx.id}
            className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-100">{idx.name}</div>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  idx.enabled ? 'bg-green-900/60 text-green-200' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {idx.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            {idx.url && (
              <div className="text-xs text-slate-500 break-all">
                {idx.url}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default IndexersPage
