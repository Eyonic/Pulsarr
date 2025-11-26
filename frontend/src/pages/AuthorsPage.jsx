import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, Clock, Plus, RefreshCw, Search, Trash } from 'lucide-react'

const AuthorsPage = ({ openAuthorId = null, onClearOpenAuthor = () => {} }) => {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [library, setLibrary] = useState([])
  const [books, setBooks] = useState([])
  const [missingBooks, setMissingBooks] = useState([])
  const [activeTab, setActiveTab] = useState('library')
  const [selectedAuthor, setSelectedAuthor] = useState(null)
  const [error, setError] = useState(null)
  const [missingError, setMissingError] = useState(null)
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [missingLoading, setMissingLoading] = useState(false)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadingSingle, setDownloadingSingle] = useState(null)

  useEffect(() => {
    fetchLibrary()
  }, [])

  useEffect(() => {
    if (activeTab === 'library') {
      setSelectedAuthor(null)
      setBooks([])
      setMissingBooks([])
    }
  }, [activeTab])

  useEffect(() => {
    if (!openAuthorId) return
    if (!library.length) {
      fetchLibrary()
      return
    }
    const found = library.find((a) => a.id === openAuthorId)
    if (found && (!selectedAuthor || selectedAuthor.id !== found.id)) {
      selectAuthor(found, false)
      onClearOpenAuthor()
    }
  }, [openAuthorId, library]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLibrary = async () => {
    setLoadingLibrary(true)
    try {
      setError(null)
      const res = await fetch('/api/authors/')
      if (!res.ok) {
        setError(`Backend Error: ${res.status} ${res.statusText}`)
        setLibrary([])
        return
      }
      const data = await res.json()
      setLibrary(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Network/Fetch error:', err)
      setError('Could not connect to Backend API')
      setLibrary([])
    } finally {
      setLoadingLibrary(false)
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query) return
    setSearching(true)
    try {
      setError(null)
      const res = await fetch(`/api/authors/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const data = await res.json()
      setSearchResults(data)
    } catch (err) {
      console.error('Search failed:', err)
      setError('Search failed. Check console for details.')
    } finally {
      setSearching(false)
    }
  }

  const addAuthor = async (author) => {
    try {
      const payload = {
        name: author.name,
        ol_id: author.ol_id,
        image_url: author.image_url,
        monitored: true
      }

      const res = await fetch('/api/authors/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        await fetchLibrary()
        setSearchResults((prev) => prev.filter((a) => a.ol_id !== author.ol_id))
        setActiveTab('library')
      } else {
        const err = await res.json()
        setError(err.detail || 'Unable to add author')
      }
    } catch (err) {
      console.error('Failed to add author', err)
      setError('Failed to add author')
    }
  }

  const selectAuthor = async (author, refreshBooks = false) => {
    setSelectedAuthor(author)
    setActiveTab('details')
    setBooks([])
    setMissingBooks([])
    await Promise.all([loadOwnedBooks(author, refreshBooks), loadMissingBooks(author)])
  }

  const loadOwnedBooks = async (author, refreshBooks) => {
    setLoadingBooks(true)
    try {
      setError(null)
      const res = await fetch(`/api/authors/${author.id}/books?refresh=${refreshBooks}`)
      if (!res.ok) throw new Error(`Failed to load books (${res.status})`)
      const data = await res.json()
      setBooks(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load books', err)
      setError('Failed to load books for this author')
    } finally {
      setLoadingBooks(false)
    }
  }

  const loadMissingBooks = async (author) => {
    setMissingLoading(true)
    setMissingError(null)
    try {
      const res = await fetch(`/api/authors/${author.id}/missing-audiobooks`)
      if (!res.ok) throw new Error(`Failed to load missing audiobooks (${res.status})`)
      const data = await res.json()
      setMissingBooks(Array.isArray(data?.missing) ? data.missing : [])
    } catch (err) {
      console.error('Failed to load missing audiobooks', err)
      setMissingError('Failed to load missing audiobooks.')
      setMissingBooks([])
    } finally {
      setMissingLoading(false)
    }
  }

  const addMissingBook = async (book) => {
    if (!selectedAuthor) return
    setDownloadingSingle(book.title)
    try {
      await sendDownloadRequest(selectedAuthor.id, book.title)
    } catch (err) {
      console.error('Failed to download missing book', err)
    } finally {
      setDownloadingSingle(null)
    }
  }

  const addAllMissingBooks = async () => {
    if (!selectedAuthor || missingBooks.length === 0) return
    setDownloadingAll(true)
    try {
      for (const book of missingBooks) {
        // eslint-disable-next-line no-await-in-loop
        await sendDownloadRequest(selectedAuthor.id, book.title)
      }
    } catch (err) {
      console.error('Failed to download all missing books', err)
    } finally {
      setDownloadingAll(false)
    }
  }

  const sendDownloadRequest = async (authorId, title) => {
    const res = await fetch(`/api/authors/${authorId}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setMissingError(data.detail || 'Failed to queue download')
      throw new Error(data.detail || 'Failed to queue download')
    }
  }

  const booksCountLabel = (author) => {
    if (author.book_count === 0 || author.book_count === undefined) return 'Books: 0'
    return `Books: ${author.book_count}`
  }

  const deleteAuthor = async (authorId) => {
    const confirmDelete = window.confirm('Remove this author and their books?')
    if (!confirmDelete) return
    try {
      setError(null)
      const res = await fetch(`/api/authors/${authorId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      await fetchLibrary()
      setSelectedAuthor(null)
      setBooks([])
      setActiveTab('library')
    } catch (err) {
      console.error('Delete failed', err)
      setError('Failed to delete author')
    }
  }

  const goToLibrary = () => {
    setActiveTab('library')
    fetchLibrary()
  }

  return (
    <div className="max-w-5xl mx-auto">
      <header className="flex flex-wrap justify-between items-center gap-3 mb-8 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold text-blue-400">Authors</h1>
          <span className="text-slate-500 text-sm">Manage monitored authors and their books</span>
        </div>
        <div className="space-x-2">
          <button
            onClick={() => goToLibrary()}
            className={`px-4 py-2 rounded transition-colors ${
              activeTab === 'library' ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            Library
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded transition-colors ${
              activeTab === 'search' ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            Add New
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-100 p-4 rounded mb-6 flex items-center gap-2">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {activeTab === 'search' && (
        <div className="mb-8">
          <form onSubmit={handleSearch} className="flex gap-2 mb-6">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for an author (e.g. Stephen King)..."
              className="flex-1 bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 px-6 rounded flex items-center gap-2 font-medium transition-colors disabled:opacity-60"
              disabled={searching}
            >
              <Search size={20} /> {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          <div className="grid grid-cols-1 gap-4">
            {searchResults.map((author) => (
              <div
                key={author.ol_id}
                className="bg-slate-800 p-4 rounded flex items-center justify-between border border-slate-700 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {author.image_url ? (
                    <img
                      src={author.image_url}
                      alt={author.name}
                      className="w-12 h-16 object-cover rounded shadow-sm"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-xs">
                      No Img
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-lg">{author.name}</h3>
                    <p className="text-sm text-slate-400">{author.top_work || 'Top work unknown'}</p>
                  </div>
                </div>
                <button
                  onClick={() => addAuthor(author)}
                  className="bg-green-600 hover:bg-green-700 text-white p-2 rounded-full transition-transform active:scale-95"
                  title="Add to Library"
                >
                  <Plus size={20} />
                </button>
              </div>
            ))}
            {searchResults.length === 0 && query && (
              <p className="text-center text-slate-500 mt-4">No results found.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'library' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-100">Monitored Authors</h2>
            <button
              onClick={fetchLibrary}
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
              disabled={loadingLibrary}
            >
              <RefreshCw size={16} className={loadingLibrary ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {library.length === 0 && !error && (
              <div className="col-span-2 text-center py-12 bg-slate-800/50 rounded border border-slate-700 border-dashed">
                <p className="text-slate-400 text-lg mb-2">Your library is empty.</p>
                <button
                  onClick={() => setActiveTab('search')}
                  className="text-blue-400 hover:underline"
                >
                  Go search for an author to add!
                </button>
              </div>
            )}

            {library.map((author) => (
              <div
                key={author.id}
                className="bg-slate-800 p-4 rounded flex items-center gap-4 border border-slate-700 hover:border-blue-500/50 transition-colors group"
              >
                <button
                  onClick={() => selectAuthor(author, false)}
                  className="text-left flex items-center gap-4 flex-1 focus:outline-none"
                >
                  {author.image_url ? (
                    <img src={author.image_url} alt={author.name} className="w-16 h-24 object-cover rounded shadow-md" />
                  ) : (
                    <div className="w-16 h-24 bg-slate-700 rounded flex items-center justify-center text-slate-500 font-bold text-2xl">
                      ?
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-bold text-xl group-hover:text-blue-400 transition-colors">
                      {author.name}
                    </h3>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <span className="bg-blue-900/50 text-blue-200 text-xs px-2 py-1 rounded border border-blue-800">
                        Monitored
                      </span>
                      <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded">
                        {booksCountLabel(author)}
                      </span>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => deleteAuthor(author.id)}
                  className="text-slate-300 hover:text-red-400 transition-colors p-2 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                  title="Delete author"
                >
                  <Trash size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'details' && selectedAuthor && (
        <div>
          <button
            onClick={() => goToLibrary()}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white mb-4"
          >
            <ArrowLeft size={16} /> Back to Library
          </button>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4 flex items-center gap-4">
            {selectedAuthor.image_url ? (
              <img src={selectedAuthor.image_url} alt={selectedAuthor.name} className="w-20 h-28 object-cover rounded shadow" />
            ) : (
              <div className="w-20 h-28 bg-slate-700 rounded flex items-center justify-center text-slate-500 font-bold text-2xl">
                ?
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-slate-100">{selectedAuthor.name}</h2>
              <div className="mt-2 flex gap-2 flex-wrap text-sm text-slate-300">
                <span className="bg-blue-900/50 text-blue-200 px-2 py-1 rounded border border-blue-800">
                  Monitored
                </span>
                <span className="bg-slate-700 px-2 py-1 rounded border border-slate-600">
                  OpenLibrary: {selectedAuthor.ol_id}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => selectAuthor(selectedAuthor, true)}
                className="flex items-center gap-2 text-sm text-slate-200 bg-slate-700 px-3 py-2 rounded hover:bg-slate-600"
                disabled={loadingBooks}
              >
                <RefreshCw size={16} className={loadingBooks ? 'animate-spin' : ''} />
                Refresh Books
              </button>
              <button
                onClick={addAllMissingBooks}
                className="flex items-center gap-2 text-sm text-green-200 bg-green-800/60 px-3 py-2 rounded hover:bg-green-700/80 disabled:opacity-60"
                disabled={downloadingAll || missingBooks.length === 0}
              >
                {downloadingAll ? <Clock size={16} className="animate-spin" /> : <Plus size={16} />}
                {downloadingAll ? 'Downloading...' : 'Download all missing'}
              </button>
              <button
                onClick={() => loadMissingBooks(selectedAuthor)}
                className="flex items-center gap-2 text-sm text-slate-200 bg-slate-700 px-3 py-2 rounded hover:bg-slate-600"
                disabled={missingLoading}
              >
                <RefreshCw size={16} className={missingLoading ? 'animate-spin' : ''} />
                Refresh Missing
              </button>
              <button
                onClick={() => deleteAuthor(selectedAuthor.id)}
                className="flex items-center gap-2 text-sm text-red-200 bg-red-800/60 px-3 py-2 rounded hover:bg-red-700/80"
              >
                <Trash size={16} /> Remove
              </button>
            </div>
        </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-100">Books</h3>
              {loadingBooks && (
                <span className="flex items-center gap-2 text-slate-300 text-sm">
                  <Clock size={16} className="animate-spin" /> Updating from OpenLibrary...
                </span>
              )}
            </div>
            {books.length === 0 && !loadingBooks && (
              <p className="text-slate-400">No books found for this author yet.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {books.map((book) => {
                const coverSrc = book.cached_cover_url || book.abs_cover_url || book.cover_url
                const narrators =
                  book.narrators && Array.isArray(book.narrators)
                    ? book.narrators.map((n) => n.name).join(', ')
                    : ''

                return (
                  <div key={book.id} className="border border-slate-700 rounded p-3 flex gap-3 bg-slate-900/40">
                    {coverSrc ? (
                      <img src={coverSrc} alt={book.title} className="w-14 h-20 object-cover rounded" />
                    ) : (
                      <div className="w-14 h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-sm">
                        No Cover
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-100">{book.title}</h4>
                      <p className="text-slate-400 text-sm">
                        First published: {book.first_publish_year || 'Unknown'}
                      </p>
                      {narrators && <p className="text-slate-400 text-xs mt-1">Narrated by: {narrators}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-100">Missing audiobooks (iTunes)</h3>
              {missingLoading && (
                <span className="flex items-center gap-2 text-slate-300 text-sm">
                  <Clock size={16} className="animate-spin" /> Loading...
                </span>
              )}
            </div>
            {missingBooks.length === 0 && !missingLoading && (
              <p className="text-slate-400">No missing audiobooks found for this author.</p>
            )}
            {missingError && <p className="text-red-300 text-sm mb-2">{missingError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {missingBooks.map((book) => (
                <div
                  key={`${book.title}-${book.source}`}
                  className="border border-slate-700 rounded p-3 flex gap-3 bg-slate-900/40"
                >
                  {book.cover_url ? (
                    <img src={book.cover_url} alt={book.title} className="w-14 h-20 object-cover rounded" />
                  ) : (
                    <div className="w-14 h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-sm">
                      No Cover
                    </div>
                  )}
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-100">{book.title}</h4>
                    <p className="text-slate-400 text-xs">Source: {book.source || 'iTunes'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addMissingBook(book)}
                    disabled={downloadingSingle === book.title}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded disabled:opacity-60 self-start"
                  >
                    {downloadingSingle === book.title ? 'Sending...' : 'Download'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AuthorsPage
