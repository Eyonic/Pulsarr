import { useEffect, useState } from 'react'
import {
  ActivitySquare,
  AlertCircle,
  ArrowLeft,
  BookMarked,
  BookOpen,
  Clock,
  FolderOpen,
  LayoutDashboard,
  Library,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Trash
} from 'lucide-react'

function App() {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [library, setLibrary] = useState([])
  const [books, setBooks] = useState([])
  const [activeTab, setActiveTab] = useState('library') // 'library' | 'search' | 'details'
  const [activePage, setActivePage] = useState('authors') // 'dashboard' | 'authors' | 'books' | 'import' | 'activity' | 'settings'
  const [selectedAuthor, setSelectedAuthor] = useState(null)
  const [error, setError] = useState(null)
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loadingBooks, setLoadingBooks] = useState(false)

  // Legacy import (placeholder)
  const [importPath, setImportPath] = useState('')
  const [importDryRun, setImportDryRun] = useState(true)
  const [importStatus, setImportStatus] = useState(null)
  const [importLoading, setImportLoading] = useState(false)

  // NEW: Audiobookshelf import
  const [absDryRun, setAbsDryRun] = useState(true)
  const [absImportLoading, setAbsImportLoading] = useState(false)
  const [absImportStatus, setAbsImportStatus] = useState(null)

  // NEW: Auto-sync
  const [autosyncStatus, setAutosyncStatus] = useState({
    enabled: false,
    interval_hours: 6,
    last_run: null,
    last_result: null
  })
  const [autosyncConfigSaving, setAutosyncConfigSaving] = useState(false)
  const [autosyncMessage, setAutosyncMessage] = useState(null)
  const [syncNowLoading, setSyncNowLoading] = useState(false)

  // Torrent import
  const [magnetUrl, setMagnetUrl] = useState('')
  const [torrentStatus, setTorrentStatus] = useState(null)
  const [torrentLoading, setTorrentLoading] = useState(false)
  const [magnetLabel, setMagnetLabel] = useState('')

  // Settings
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
    fetchLibrary()
  }, [])

  useEffect(() => {
    if (activeTab === 'library') {
      setSelectedAuthor(null)
      setBooks([])
    }
  }, [activeTab])

  useEffect(() => {
    if (activePage === 'settings') {
      loadSettings()
    }
  }, [activePage])

  useEffect(() => {
    if (activePage === 'import') {
      fetchAutosyncStatus()
    }
  }, [activePage])

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
      setImportStatus({ type: 'success', message: `Queued import${importPath ? ` for ${importPath}` : ''}` })
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
      if (!magnetLabel) {
        setMagnetLabel(data.deluge_label || '')
      }
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

  // --- NEW: Autosync status & control ---
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
      const params = new URLSearchParams({
        enabled: String(autosyncStatus.enabled),
        interval_hours: String(autosyncStatus.interval_hours || 6)
      })
      const res = await fetch(`/api/autosync/configure?${params.toString()}`, {
        method: 'POST'
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

  // --- NEW: Audiobookshelf import ---
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
      // refresh authors/library
      fetchLibrary()
    } catch (err) {
      console.error('ABS import failed', err)
      setAbsImportStatus({ type: 'error', message: 'Audiobookshelf import failed' })
    } finally {
      setAbsImportLoading(false)
    }
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'authors', label: 'Authors', icon: Library },
    { id: 'books', label: 'Books', icon: BookMarked },
    { id: 'import', label: 'Library Import', icon: FolderOpen },
    { id: 'activity', label: 'Activity', icon: ActivitySquare },
    { id: 'settings', label: 'Settings', icon: Settings }
  ]

  const Placeholder = ({ title, message }) => (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-6">
      <h2 className="text-2xl font-semibold text-slate-100 mb-2">{title}</h2>
      <p className="text-slate-400">{message}</p>
    </div>
  )

  const authorsContent = (
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
              activeTab === 'library'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            Library
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded transition-colors ${
              activeTab === 'search'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700'
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <img
                      src={author.image_url}
                      alt={author.name}
                      className="w-16 h-24 object-cover rounded shadow-md"
                    />
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
              <img
                src={selectedAuthor.image_url}
                alt={selectedAuthor.name}
                className="w-20 h-28 object-cover rounded shadow"
              />
            ) : (
              <div className="w-20 h-28 bg-slate-700 rounded flex items-center justify-center text-slate-500 font-bold text-2xl">
                ?
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-slate-100">
                {selectedAuthor.name}
              </h2>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {books.map((book) => {
                const coverSrc = book.abs_cover_url || book.cover_url
                const narrators =
                  book.narrators && Array.isArray(book.narrators)
                    ? book.narrators.map((n) => n.name).join(', ')
                    : ''

                return (
                  <div
                    key={book.id}
                    className="border border-slate-700 rounded p-3 flex gap-3 bg-slate-900/40"
                  >
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt={book.title}
                        className="w-14 h-20 object-cover rounded"
                      />
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
                      {narrators && (
                        <p className="text-slate-400 text-xs mt-1">
                          Narrated by: {narrators}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const renderImportPage = () => (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold text-blue-400">Library Import</h1>
        <span className="text-slate-500 text-sm">
          Sync Audiobookshelf and legacy imports
        </span>
      </div>

      {/* Audiobookshelf auto-sync */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio size={18} className="text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-slate-100">
                Audiobookshelf Auto-Sync
              </h2>
              <p className="text-slate-500 text-sm">
                Periodically sync your Audiobookshelf library into Pulsarr
              </p>
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
            {autosyncStatus.last_run
              ? new Date(autosyncStatus.last_run).toLocaleString()
              : 'never'}
          </div>
          {autosyncStatus.last_result && autosyncStatus.last_result.imported_count != null && (
            <div>
              Last result: imported {autosyncStatus.last_result.imported_count} items
            </div>
          )}
          {autosyncStatus.last_result && autosyncStatus.last_result.error && (
            <div className="text-red-300">
              Last error: {autosyncStatus.last_result.error}
            </div>
          )}
        </div>

        {autosyncMessage && (
          <div
            className={`text-sm ${
              autosyncMessage.type === 'success'
                ? 'text-green-300'
                : 'text-red-300'
            }`}
          >
            {autosyncMessage.message}
          </div>
        )}
      </div>

      {/* One-off Audiobookshelf import */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Library size={18} className="text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold text-slate-100">
              One-off Import from Audiobookshelf
            </h2>
            <p className="text-slate-500 text-sm">
              Run an immediate sync, with optional dry run
            </p>
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

      {/* Legacy local import placeholder */}
      <form
        onSubmit={handleImport}
        className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4"
      >
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

      {/* Torrent import */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Radio size={18} className="text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Import Torrent (Deluge)</h2>
            <p className="text-slate-500 text-sm">
              Send a magnet link to Deluge on port 8112
            </p>
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
            placeholder={`Label (default: ${settings.deluge_label || 'Pulsarr'})`}
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

  const renderPage = () => {
    if (activePage === 'authors') return authorsContent
    if (activePage === 'dashboard')
      return (
        <Placeholder
          title="Dashboard"
          message="Overview cards and health checks will live here (queue, downloads, and stats)."
        />
      )
    if (activePage === 'books')
      return (
        <Placeholder
          title="Books"
          message="Indexed books, formats, and search queue will surface here in a future phase."
        />
      )
    if (activePage === 'import') return renderImportPage()
    if (activePage === 'activity')
      return (
        <Placeholder
          title="Activity"
          message="Recent searches, grabs, and import events will be shown here."
        />
      )

    // Settings page
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
                placeholder="Pulsarr"
                className="w-full bg-slate-800 border border-slate-700 p-3 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Audiobookshelf</h2>
              <p className="text-slate-500 text-sm">
                Configure the base URL and API key used for imports and auto-sync.
              </p>
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
            <span
              className={`text-sm ${
                settingsStatus.type === 'success' ? 'text-green-300' : 'text-red-300'
              }`}
            >
              {settingsStatus.message}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Settings apply immediately and are stored in the database for restarts.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex">
      <aside className="w-60 bg-slate-900 border-r border-slate-800 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-8 px-2">
          <BookOpen className="text-blue-400" />
          <div>
            <div className="text-lg font-bold text-blue-400">Pulsarr</div>
            <div className="text-xs text-slate-400">Automated book manager</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                activePage === id
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent hover:bg-slate-800 text-slate-300'
              }`}
            >
              <Icon size={18} />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </nav>
        <div className="text-xs text-slate-500 px-3 pt-4 border-t border-slate-800">
          ABS import & auto-sync enabled
        </div>
      </aside>
      <main className="flex-1 p-6 sm:p-8">{renderPage()}</main>
    </div>
  )
}

export default App
