import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const ActivityPage = () => {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/activity')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Failed to load activity (${res.status})`)
      }
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load activity', err)
      setError('Failed to load activity.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">Activity</h1>
          <p className="text-slate-500 text-sm">Recent searches, grabs, and imports.</p>
        </div>
        <button
          onClick={fetchEvents}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 px-3 py-2 rounded"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="text-sm text-red-300">{error}</div>}

      {events.length === 0 && !loading && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 text-slate-400">
          No activity recorded yet.
        </div>
      )}

      <div className="space-y-2">
        {events.map((evt, idx) => (
          <div
            key={`${evt.timestamp || idx}-${evt.message || idx}`}
            className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex justify-between items-start"
          >
            <div>
              <div className="text-slate-200 text-sm">{evt.message || evt.event || 'Event'}</div>
              <div className="text-xs text-slate-500 space-y-1">
                <div>
                  {evt.author || evt.source ? `${evt.author || evt.source} • ` : ''}
                  {evt.status ? `Status: ${evt.status}` : ''}
                </div>
                {evt.detail && <pre className="whitespace-pre-wrap break-words">{evt.detail}</pre>}
              </div>
            </div>
            <div className="text-xs text-slate-500">{evt.timestamp ? new Date(evt.timestamp).toLocaleString() : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ActivityPage
