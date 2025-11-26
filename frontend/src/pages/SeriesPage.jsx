import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import PlaceholderCard from '../components/PlaceholderCard'

const SeriesPage = () => {
  const [libraryId, setLibraryId] = useState('audiobooks')
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchSeries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchSeries = async () => {
    if (!libraryId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/libraries/${libraryId}/series`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Failed to load series (${res.status})`)
      }
      const data = await res.json()
      setSeries(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load series', err)
      setError('Failed to load series. Check your library ID and try again.')
      setSeries([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">Series</h1>
          <p className="text-slate-500 text-sm">Browse series from your Audiobookshelf library.</p>
        </div>
        <button
          onClick={fetchSeries}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 px-3 py-2 rounded"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3">
        <label className="block text-sm text-slate-300">Library ID</label>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={libraryId}
            onChange={(e) => setLibraryId(e.target.value)}
            placeholder="audiobooks"
            className="flex-1 min-w-[240px] bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={fetchSeries}
            disabled={!libraryId || loading}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Load Series
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Uses `/api/libraries/{libraryId}/series` from the backend. The default Audiobookshelf library id is often
          `audiobooks`.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-100 p-4 rounded flex items-center gap-2">
          <span>{error}</span>
        </div>
      )}

      {!loading && series.length === 0 && !error && (
        <PlaceholderCard title="No series found" message="Try another library id or run an import first." />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {series.map((item) => {
          const title = item.name || item.title || 'Untitled series'
          const bookCount = item.book_count || item.itemsCount || item.items_count
          const cover = item.cover || item.image || item.cover_url || item.abs_cover_url

          return (
            <div key={item.id || title} className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 flex gap-4">
              {cover ? (
                <img src={cover} alt={title} className="w-16 h-16 object-cover rounded" />
              ) : (
                <div className="w-16 h-16 bg-slate-800 rounded flex items-center justify-center text-slate-500 text-xs">
                  No Cover
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
                {item.authorName && <p className="text-slate-400 text-sm">Author: {item.authorName}</p>}
                {bookCount !== undefined && (
                  <p className="text-slate-500 text-sm">{bookCount} item{bookCount === 1 ? '' : 's'}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SeriesPage
