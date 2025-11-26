const PlaceholderCard = ({ title, message }) => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-6">
    <h2 className="text-2xl font-semibold text-slate-100 mb-2">{title}</h2>
    <p className="text-slate-400">{message}</p>
  </div>
)

export default PlaceholderCard
