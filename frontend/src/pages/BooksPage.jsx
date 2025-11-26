import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const BooksPage = ({ onOpenAuthor }) => {
  const [books, setBooks] = useState([])
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [preloading, setPreloading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    fetchBooks()
  }, [page])

  useEffect(() => {
    // Preload cover images so cards render faster when visible.
    const covers = books
      .map((book) => book.cached_cover_url || book.abs_cover_url || book.cover_url)
      .filter(Boolean)
    if (covers.length === 0) return

    setPreloading(true)
    const loaders = covers.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image()
          img.onload = () => resolve()
          img.onerror = () => resolve()
          img.src = src
        })
    )
    Promise.all(loaders).finally(() => setPreloading(false))
  }, [books])

  const fetchBooks = async () => {
    setLoading(true)
    setError(null)
    try {
      const offset = (page - 1) * pageSize
      const res = await fetch(`/api/books?limit=${pageSize}&offset=${offset}`)
      if (!res.ok) throw new Error(`Failed to load books (${res.status})`)
      const data = await res.json()
      const normalized = Array.isArray(data) ? data : []
      setBooks(normalized)
      setHasMore(normalized.length === pageSize)
    } catch (err) {
      console.error('Failed to load books library', err)
      setError('Failed to load books. Please try again.')
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">Books</h1>
          <p className="text-slate-500 text-sm">All imported books across your monitored authors</p>
        </div>
        <button
          onClick={() => fetchBooks()}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 px-3 py-2 rounded"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {preloading && (
        <div className="text-xs text-slate-500">Preloading covers to speed up rendering...</div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-100 p-4 rounded flex items-center gap-2">
          <span>{error}</span>
        </div>
      )}

      {!loading && books.length === 0 && !error && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 text-center text-slate-400">
          No books found yet. Try importing from Audiobookshelf or refreshing authors.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {books.map((book) => {
          const coverSrc = book.cached_cover_url || book.abs_cover_url || book.cover_url
          const narrators =
            book.narrators && Array.isArray(book.narrators)
              ? book.narrators.map((n) => n.name).join(', ')
              : ''

          return (
            <button
              key={book.id}
              type="button"
              onClick={() => onOpenAuthor?.(book.author_id)}
              className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 flex gap-4 text-left hover:border-blue-600 transition-colors"
            >
              {coverSrc ? (
                <img src={coverSrc} alt={book.title} className="w-16 h-24 object-cover rounded" />
              ) : (
                <div className="w-16 h-24 bg-slate-800 rounded flex items-center justify-center text-slate-500 text-xs">
                  No Cover
                </div>
              )}
              <div className="flex-1 space-y-1">
                <h3 className="text-lg font-semibold text-slate-100">{book.title}</h3>
                <p className="text-slate-400 text-sm">Author: {book.author_name || 'Unknown'}</p>
                <p className="text-slate-400 text-sm">
                  First published: {book.first_publish_year || 'Unknown'}
                </p>
                {narrators && (
                  <p className="text-slate-500 text-xs">Narrated by: {narrators}</p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-3 py-1 rounded bg-slate-800 text-slate-200 disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-slate-400">Page {page}</span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore}
          className="px-3 py-1 rounded bg-slate-800 text-slate-200 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default BooksPage
