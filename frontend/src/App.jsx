import { useState } from 'react'
import {
  ActivitySquare,
  BookMarked,
  FolderOpen,
  LayoutDashboard,
  Library,
  Loader2,
  ListChecks,
  Search,
  Server,
  Settings
} from 'lucide-react'

import ActivityPage from './pages/ActivityPage'
import AuthorsPage from './pages/AuthorsPage'
import BooksPage from './pages/BooksPage'
import DashboardPage from './pages/DashboardPage'
import ImportPage from './pages/ImportPage'
import IndexersPage from './pages/IndexersPage'
import SeriesPage from './pages/SeriesPage'
import SettingsPage from './pages/SettingsPage'
import Logo from './media/logo.png'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'authors', label: 'Authors', icon: Library },
  { id: 'books', label: 'Books', icon: BookMarked },
  { id: 'series', label: 'Series', icon: ListChecks },
  { id: 'import', label: 'Library Import', icon: FolderOpen },
  { id: 'indexers', label: 'Indexers', icon: Server },
  { id: 'activity', label: 'Activity', icon: ActivitySquare },
  { id: 'settings', label: 'Settings', icon: Settings }
]

const App = () => {
  const [activePage, setActivePage] = useState('authors')
  const [authorToOpen, setAuthorToOpen] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const handleOpenAuthor = (authorId) => {
    if (!authorId) return
    setAuthorToOpen(authorId)
    setActivePage('authors')
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchError(null)
    setSearchResults([])
    try {
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(searchQuery.trim())}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Search failed (${res.status})`)
      }
      const data = await res.json()
      setSearchResults(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Book search failed', err)
      setSearchError('Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  const handleSelectResult = (result) => {
    handleOpenAuthor(result.author_id)
    setSearchQuery('')
    setSearchResults([])
  }

  const renderPage = () => {
    if (activePage === 'dashboard') return <DashboardPage />
    if (activePage === 'authors')
      return (
        <AuthorsPage
          openAuthorId={authorToOpen}
          onClearOpenAuthor={() => setAuthorToOpen(null)}
        />
      )
    if (activePage === 'books') return <BooksPage onOpenAuthor={handleOpenAuthor} />
    if (activePage === 'series') return <SeriesPage />
    if (activePage === 'indexers') return <IndexersPage />
    if (activePage === 'import') return <ImportPage />
    if (activePage === 'activity') return <ActivityPage />
    return <SettingsPage />
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col lg:flex-row">
      <aside className="w-full lg:w-60 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-6 lg:mb-8 px-2">
          <img src={Logo} alt="Pulsarr" className="w-8 h-8 object-contain" />
          <div>
            <div className="text-lg font-bold text-blue-400">Pulsarr</div>
            <div className="text-xs text-slate-400">Automated book manager</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 grid grid-cols-2 lg:block gap-2">
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
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 shadow-sm">
            <form onSubmit={handleSearch} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your library for a book title..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <Search size={16} className="text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white flex items-center gap-2 disabled:opacity-60"
                >
                  {searching ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
              {searchError && <div className="text-sm text-red-300">{searchError}</div>}
            </form>

            {searchResults.length > 0 && (
              <div className="mt-3 bg-slate-900 border border-slate-800 rounded-lg divide-y divide-slate-800">
                {searchResults.map((item) => {
                  const cover = item.cached_cover_url || item.abs_cover_url || item.cover_url
                  return (
                    <button
                      key={`${item.id}-${item.author_id}`}
                      type="button"
                      onClick={() => handleSelectResult(item)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-800 transition-colors"
                    >
                      {cover ? (
                        <img src={cover} alt={item.title} className="w-12 h-16 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-16 bg-slate-800 rounded flex items-center justify-center text-slate-500 text-xs">
                          No Cover
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                        <div className="text-xs text-slate-400">by {item.author_name}</div>
                      </div>
                      <span className="text-blue-400 text-xs">View author</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {renderPage()}
      </main>
    </div>
  )
}

export default App
